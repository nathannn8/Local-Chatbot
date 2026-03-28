import os
from mcp.server.fastmcp import FastMCP
import pandas as pd

# get the directory where this file lives, regardless of how it's called
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")

mcp = FastMCP("excel-server")

@mcp.tool()
def execute_excel_query(filename: str, code: str):
    """Execute Python pandas code on an uploaded Excel file safely"""
    filepath = os.path.join(UPLOADS_DIR, filename)
    
    if not os.path.exists(filepath):
        # try current directory as fallback
        fallback = os.path.join(os.getcwd(), "uploads", filename)
        if os.path.exists(fallback):
            filepath = fallback
        else:
            return f"File not found. Tried: {filepath} and {fallback}"
    
    safe_globals = {
        "pd": pd,
        "filename": filepath
    }
    exec(code, safe_globals)
    result = safe_globals.get("result")
    return str(result)

if __name__ == "__main__":
    mcp.run()