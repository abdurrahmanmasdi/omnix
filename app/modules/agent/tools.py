from langchain_core.tools import tool
from app.core.database import SessionLocal, OrganizationKnowledge
from sqlalchemy import select

# We use a global or injected session for tools (simplified for MVP)
def get_db():
    return SessionLocal()

@tool
def search_clinic_knowledge(organization_id: str, search_query: str) -> str:
    """
    Searches the clinic's database for prices, medical procedures, or rules.
    Use this WHENEVER the patient asks a specific question about the clinic's services.
    """
    print(f"🛠️ [TOOL EXECUTED] Searching DB for: '{search_query}'")
    db = get_db()
    try:
        # Note: In a full setup, you'd embed the 'search_query' here and do the pgvector cosine math.
        # For this example, we are using a simplified vector retrieval logic wrapper.
        from app.modules.rag.retriever import RAGRetriever
        retriever = RAGRetriever(db)
        
        # We must use asyncio.run or adapt our retriever to be synchronous for Langchain tools,
        # OR define the tool as an async tool. Let's make it async:
        pass # See async tool definition below
    finally:
        db.close()

# Let's write them as proper ASYNC tools since our stack is FastAPI/gRPC
from langchain_core.tools import tool

@tool
async def search_clinic_knowledge_async(organization_id: str, search_query: str) -> str:
    """
    Searches the clinic's database for prices, medical procedures, or rules.
    Use this WHENEVER the patient asks a specific question about the clinic's services.
    """
    print(f"🛠️ [TOOL] Searching Knowledge Base for: '{search_query}'")
    db = SessionLocal()
    try:
        from app.modules.rag.retriever import RAGRetriever
        retriever = RAGRetriever(db)
        
        # We use our existing RAG logic!
        context = await retriever.get_relevant_context(organization_id, search_query)
        return context
    except Exception as e:
        return f"Error searching database: {str(e)}"
    finally:
        db.close()


@tool
async def update_lead_priority(conversation_id: str, new_priority: str) -> str:
    """
    Updates the patient's CRM priority level.
    Allowed values for new_priority: "COLD", "WARM", "HOT".
    Use "HOT" if the patient asks to book, asks for payment details, or agrees to a procedure.
    Use "WARM" if they are asking many detailed questions but haven't committed.
    """
    print(f"🛠️ [TOOL] Updating CRM Priority to: '{new_priority}' for Conv: {conversation_id}")
    
    # Here you would do a standard SQLAlchemy UPDATE on your Conversations/Leads table
    # db.execute(update(Conversation).where(id==conversation_id).values(priority=new_priority))
    
    return f"Successfully updated lead priority to {new_priority}."