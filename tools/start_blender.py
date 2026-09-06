import bpy
import importlib.util
from pathlib import Path

root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('range_blender_mcp', root / 'blender_mcp_addon.py')
addon = importlib.util.module_from_spec(spec)
spec.loader.exec_module(addon)
addon.register()
bpy.types.range_mcp_server = addon.BlenderMCPServer(host='127.0.0.1', port=9876)
bpy.types.range_mcp_server.start()
print('RANGE Blender MCP ready', flush=True)
