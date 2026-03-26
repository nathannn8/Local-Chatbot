import os
from dotenv import load_dotenv
import requests
from mcp.server.fastmcp import FastMCP

load_dotenv()

mcp = FastMCP("tavily-server")

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

@mcp.tool()
def web_search(query: str):
    """Search the web using Tavily if the question is not about documents"""
    response = requests.post(
        "https://api.tavily.com/search",
        json={
            "api_key": TAVILY_API_KEY,
            "query": query,
            "max_results": 5
        }
    )
    data = response.json()
    return data

if __name__ == "__main__":
    mcp.run()