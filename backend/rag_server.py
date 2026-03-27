import os
from mcp.server.fastmcp import FastMCP
import ollama
import chromadb
 
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
 
mcp = FastMCP("rag-server")
 
db_client = chromadb.PersistentClient(path=os.path.join(BASE_DIR, "chromadb"))
collection = db_client.get_or_create_collection(name="documents")

# rag_server.py - Optimization: Multi-result retrieval
@mcp.tool()
def document_search(query: str):
    """Search the document knowledge base for specific technical details or uploaded facts."""
    response = ollama.embeddings(model="nomic-embed-text", prompt=query)
    embedding = response["embedding"]
    
    # Increase n_results to 5 for better context coverage
    results = collection.query(
        query_embeddings=[embedding],
        n_results=5 
    )
    
    # Join documents with a separator so the LLM sees distinct context chunks
    context_block = "\n---\n".join(results["documents"][0])
    return context_block

if __name__ == "__main__":
    mcp.run()
 