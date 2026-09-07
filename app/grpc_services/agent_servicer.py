import json
import base64
import io
import agent_pb2
import agent_pb2_grpc
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from app.infrastructure.database_service import DatabaseService
from app.infrastructure.llm_factory import LLMFactory
from app.modules.agent.graph_builder import agent_app

class SalesAgentServicer(agent_pb2_grpc.SalesAgentServicer):
    async def GenerateReply(self, request, context):
        org_id = getattr(request, 'organizationId', getattr(request, 'organization_id', None))
        conv_id = getattr(request, 'conversationId', getattr(request, 'conversation_id', None))
        latest_msg = getattr(request, 'latestMessage', getattr(request, 'latest_message', None))
        
        clinic_name = getattr(request, 'clinicName', getattr(request, 'clinic_name', 'our clinic'))
        agent_tone = getattr(request, 'agentTone', getattr(request, 'agent_tone', 'Professional and empathetic'))
        business_rules = getattr(request, 'businessRulesJson', getattr(request, 'business_rules_json', '{}'))
        total_count = getattr(request, 'totalMessageCount', getattr(request, 'total_message_count', 0))
        lead_summary = getattr(request, 'leadSummary', getattr(request, 'lead_summary', ''))
        needs_summarization = total_count > 0 and (total_count % 10 == 0)

        # Extract optional image from gRPC request
        image_base64 = getattr(request, 'imageBase64', getattr(request, 'image_base64', None))
        if image_base64:
            print(f"📸 [gRPC] Received Image Base64! Length: {len(image_base64)} characters.")
            if len(image_base64) > 1000:
                try:
                    print("💾 [DEBUG] Attempting to save Base64 to disk...")
                    image_data = base64.b64decode(image_base64)
                    with open("debug_received_image.jpg", "wb") as f:
                        f.write(image_data)
                    print("✅ [DEBUG] Image saved successfully as 'debug_received_image.jpg'")
                except Exception as e:
                    print(f"❌ [DEBUG] Failed to save image: {e}")
        else:
            print("⚠️ [gRPC] NO IMAGE RECEIVED IN REQUEST!")

        # Extract optional audio from gRPC request
        audio_base64 = getattr(request, 'audioBase64', getattr(request, 'audio_base64', None))
        if audio_base64:
            print(f"🎙️ [gRPC] Received Audio Base64! Length: {len(audio_base64)} characters.")
            try:
                audio_bytes = base64.b64decode(audio_base64)
                audio_file = io.BytesIO(audio_bytes)
                audio_file.name = "audio.ogg"
                
                openai_client = LLMFactory.get_async_openai_client()
                transcription = await openai_client.audio.transcriptions.create(
                    model="gpt-4o-mini-transcribe", 
                    file=audio_file
                )
                
                transcribed_text = transcription.text
                print(f"✅ [WHISPER] Transcription success: {transcribed_text}")
                latest_msg = f"🎙️ [Voice Note Transcription]: {transcribed_text}"
            except Exception as e:
                print(f"❌ [WHISPER ERROR]: {e}")
                latest_msg = "System Event: The user sent a voice note, but the audio file was corrupted or unreadable."

        print(f"\n📥 [gRPC] NestJS asked to reply to Conv: {conv_id}")
        print(f"💬 User said: {latest_msg}")
        
        try:
            # 1. Fetch Lead Info & Status from the database VIA ASYNC INFRASTRUCTURE
            res = await DatabaseService.get_conversation_lead_info(conv_id)
            
            if not res:
                print(f"⚠️ [gRPC] Conversation {conv_id} not found in DB!")
                return agent_pb2.AgentReply(replyText="System error: Conversation not found.")

            # res is a tuple-like object from SQLAlchemy execute
            # (conv_id, lead_id, firstName, lastName, gender, country, status, priority, externalContactId)
            first_name = res.firstName if getattr(res, 'lead_id', None) else "Guest"
            is_name_collected = bool(getattr(res, 'lead_id', None) and getattr(res, 'firstName', None) and str(res.firstName).strip().lower() != "guest")
            has_medical_evidence = bool(getattr(res, 'lead_id', None) and getattr(res, 'status', None) in ["QUALIFIED", "READY_TO_BOOK", "HANDED_OFF", "WON"])

            # Default state if lead doesn't exist yet
            state_data = {
                "organization_id": org_id,
                "clinic_name": clinic_name,
                "conversation_id": conv_id,
                "lead_id": str(res.lead_id) if getattr(res, 'lead_id', None) else None,
                "customer": {
                    "name": f"{first_name} {res.lastName}" if getattr(res, 'lastName', None) else first_name,
                    "phone": getattr(res, 'externalContactId', None),
                    "country": getattr(res, 'country', 'Unknown') if getattr(res, 'lead_id', None) else "Unknown",
                    "service_interested": None,
                    "is_medical_evidence_provided": has_medical_evidence
                },
                "current_intent": None,
                "active_objection": None,
                "visual_pixel_analysis": None,
                "lead_summary": lead_summary if lead_summary else None,
                "needs_summarization": needs_summarization,
                "current_stage": getattr(res, 'status', 'NEW') if getattr(res, 'lead_id', None) else "NEW",
                "pending_crm_actions": [],
                "messages": []
            }

            print(f"🔍 [State] Lead: {state_data['customer']['name']} | Status: {state_data['current_stage']} | ID: {state_data['lead_id']}")

            if lead_summary:
                state_data["messages"].append(SystemMessage(content=f"Previous Conversation Summary:\n{lead_summary}"))

            # 2. Fetch the last 120 messages VIA ASYNC INFRASTRUCTURE
            history = await DatabaseService.get_conversation_history(conv_id, limit=120)
            
            for msg in history:
                if msg.type in ['USER_TEXT', 'LEAD_TEXT']:
                    state_data["messages"].append(HumanMessage(content=msg.content))
                elif msg.type == 'AI_TEXT':
                    state_data["messages"].append(AIMessage(content=msg.content))
            
            # 3. Add the brand new message from WhatsApp
            if latest_msg and latest_msg.startswith("[User finished typing"):
                latest_msg = "" 

            if latest_msg or (image_base64 and len(image_base64) > 100):
                if image_base64 and len(image_base64) > 100:
                    # Ensure the prefix exists
                    if not image_base64.startswith("data:image"):
                        image_url = f"data:image/jpeg;base64,{image_base64}"
                    else:
                        image_url = image_base64
                                             
                    content = [
                        {"type": "text", "text": latest_msg if latest_msg else " "},
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]
                else:
                    content = latest_msg
                                     
                message = HumanMessage(content=content)
                state_data["messages"].append(message)

            # Lead Creation Hook
            if state_data["customer"]["name"] != "Guest" and not state_data["lead_id"]:
                create_lead_payload = json.dumps({
                    "firstName": first_name, 
                    "phoneNumber": getattr(res, 'externalContactId', None)
                })
                state_data["pending_crm_actions"].append(f'TOOL_ACTION:CREATE_LEAD:{create_lead_payload}')
                
            # 4. RUN THE LANGGRAPH AGENT
            config = {"configurable": {"organization_id": org_id}}
            final_state = await agent_app.ainvoke(state_data, config=config)
            
            # 5. Extract Final Content & Media
            ai_reply_msg = final_state["messages"][-1]
            ai_reply_text = ai_reply_msg.content
            
            reply_parts = [p.strip() for p in ai_reply_text.split("|||") if p.strip()]
            
            media_url = ""
            if "Photos:" in ai_reply_text:
                import re
                urls = re.findall(r'(https?://\S+)', ai_reply_text)
                if urls:
                    media_url = urls[0]
            
            # 6. Extract Tool Actions for NestJS
            tool_actions = []
            for msg in final_state["messages"]:
                if hasattr(msg, "content") and "TOOL_ACTION:" in str(msg.content):
                    try:
                        parts = msg.content.split(":", 2)
                        if len(parts) == 3:
                            tool_actions.append(agent_pb2.ToolAction(
                                type=parts[1],
                                payload=parts[2]
                            ))
                    except Exception as te:
                        print(f"⚠️ Error parsing virtual tool: {te}")
                        
            # Also extract from pending_crm_actions
            for action_str in final_state.get("pending_crm_actions", []):
                if action_str.startswith("{"):
                    try:
                        action_obj = json.loads(action_str)
                        if "action" in action_obj:
                            tool_actions.append(agent_pb2.ToolAction(
                                type=action_obj["action"],
                                payload=json.dumps(action_obj)
                            ))
                    except Exception as te:
                        print(f"⚠️ Error parsing JSON virtual tool from state: {te}")
                elif "TOOL_ACTION:" in action_str:
                    try:
                        parts = action_str.split(":", 2)
                        if len(parts) == 3:
                            tool_actions.append(agent_pb2.ToolAction(
                                type=parts[1],
                                payload=parts[2]
                            ))
                    except Exception as te:
                        print(f"⚠️ Error parsing virtual tool from state: {te}")

            final_reply_to_send = "\n\n|||\n\n".join(reply_parts)

            print(f"📤 Sending {len(reply_parts)} messages to WhatsApp.")
            
            return agent_pb2.AgentReply(
                replyText=final_reply_to_send,
                mediaUrl=media_url,
                actions=tool_actions
            )
            
        except Exception as e:
            print(f"❌ Error generating AI reply: {e}")
            return agent_pb2.AgentReply(replyText="I apologize, but I am experiencing a brief system update. Let me pass you to a human agent.")
