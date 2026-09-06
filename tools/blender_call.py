"""Run a script inside the live Blender session, or call one MCP tool.

    python tools/blender_call.py                       # scene summary (connection check)
    python tools/blender_call.py script.py             # execute the file's code in Blender
    python tools/blender_call.py --shot out.png [800]  # viewport screenshot, optional max size
    python tools/blender_call.py --tool NAME '{"json":"args"}'

The MCP add-on runs code on Blender's main thread; keep each script short of a minute. Long
Cycles bakes go through `blender.exe -b` instead (see CLAUDE.md).
"""
import asyncio
import base64
import json
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root / 'python'))
from mcp import ClientSession, StdioServerParameters  # noqa: E402
from mcp.client.stdio import stdio_client  # noqa: E402


async def main():
    params = StdioServerParameters(command=sys.executable, args=[str(root / 'mcp_server.py')],
                                   env={**os.environ, 'BLENDER_MCP_DISABLE_TELEMETRY': 'true'})
    args = sys.argv[1:]
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            if not args:
                result = await session.call_tool('get_scene_info', {'user_prompt': 'Verify the Blender connection for RANGE.'})
            elif args[0] == '--shot':
                out = Path(args[1])
                size = int(args[2]) if len(args) > 2 else 900
                result = await session.call_tool('get_viewport_screenshot', {'max_size': size})
                for c in result.content:
                    if getattr(c, 'data', None):
                        out.parent.mkdir(parents=True, exist_ok=True)
                        out.write_bytes(base64.b64decode(c.data))
                        print(json.dumps({'status': 'shot', 'file': str(out.resolve())}))
                        return
                print(result.model_dump_json())
                raise RuntimeError('No image returned')
            elif args[0] == '--tool':
                result = await session.call_tool(args[1], json.loads(args[2]) if len(args) > 2 else {})
            else:
                result = await session.call_tool('execute_blender_code', {'code': Path(args[0]).read_text(encoding='utf-8')})
            print(result.model_dump_json())
            if result.isError:
                raise RuntimeError('Blender MCP tool failed')


asyncio.run(main())
