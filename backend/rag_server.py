from mcp.server.fastmcp import FastMCP
import ollama
import chromadb


mcp = FastMCP("rag-server")

db_client = chromadb.PersistentClient(path="./chromadb")
collection = db_client.get_or_create_collection(name="documents")

@mcp.tool()
def document_search(query: str):
    """Search the document knowledge base"""
    response = ollama.embeddings(model="nomic-embed-text", prompt=query)
    embedding = response["embedding"]
    
    results = collection.query(
        query_embeddings=[embedding],
        n_results=1
    )
    
    return results["documents"][0]

if __name__ == "__main__":
    mcp.run()