import os
from mcp.server.fastmcp import FastMCP
import pandas as pd
 
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
 
mcp = FastMCP("excel-server")
 

@mcp.tool()
def execute_excel_query(filename: str, code: str):
    """Execute Python pandas code on an uploaded Excel file safely"""
    filepath = os.path.join(BASE_DIR, "uploads", filename) 
    
    if not os.path.exists(filepath):  # check filepath
        return "File not found"
    
    safe_globals = {
    "pd": pd,
    "filename": filepath
    }
    exec(code, safe_globals)
    result = safe_globals.get("result")
    return str(result)


if __name__ == "__main__":
    mcp.run()