import asyncio
import json
import os
import sys
from pathlib import Path
root = Path(__file__).resolve().parent
sys.path.insert(0, str(root / 'python'))
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    params = StdioServerParameters(command=sys.executable, args=[str(root / 'mcp_server.py')], env={**os.environ, 'BLENDER_MCP_DISABLE_TELEMETRY': 'true'})
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            if len(sys.argv) == 1:
                result = await session.call_tool('get_scene_info', {'user_prompt': 'Verify the Blender connection for RANGE.'})
            else:
                result = await session.call_tool('execute_blender_code', {'code': Path(sys.argv[1]).read_text(encoding='utf-8')})
            print(result.model_dump_json())
            if result.isError:
                raise RuntimeError('Blender MCP tool failed')

asyncio.run(main())
