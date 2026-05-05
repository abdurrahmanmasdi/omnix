import agent_pb2
import agent_pb2_grpc
from app.modules.agent.sales_agent import SalesAgentCoordinator

class SalesAgentServicer(agent_pb2_grpc.SalesAgentServicer):
    def __init__(self):
        # Initialize our OOP pipeline
        self.agent_coordinator = SalesAgentCoordinator()
        
    async def GenerateReply(self, request, context):
        # The pipeline handles everything!
        final_reply = await self.agent_coordinator.process_message(
            organization_id=request.organizationId,
            message=request.latestMessage
        )
        
        return agent_pb2.AgentReply(replyText=final_reply)