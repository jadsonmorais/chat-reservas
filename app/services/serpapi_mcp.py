"""
services/serpapi_mcp.py — SerpApi via MCP server (https://mcp.serpapi.com).

Uses the official MCP Python SDK with asyncio.run() bridge for sync Flask context.
The Streamable HTTP transport is stateless, so each call creates a fresh session —
no persistent connection needed.

Set USE_MCP=false in .env to fall back to serpapi_http.py.
"""

import asyncio
import os

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client


def search(engine: str, params: dict) -> dict:
    """Synchronous wrapper — calls the MCP server via asyncio.run()."""
    return asyncio.run(_async_search(engine, params))


async def _async_search(engine: str, params: dict) -> dict:
    api_key = os.environ.get("SERPAPI_KEY")
    if not api_key:
        raise RuntimeError("[SerpApiMCP] SERPAPI_KEY not set")

    url = f"https://mcp.serpapi.com/{api_key}/mcp"

    async with streamablehttp_client(url) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool("search", {"params": {"engine": engine, **params}})
            # MCP returns a list of content objects; extract the first text/dict
            if hasattr(result, "content") and result.content:
                content = result.content[0]
                if hasattr(content, "text"):
                    import json
                    return json.loads(content.text)
            return result
