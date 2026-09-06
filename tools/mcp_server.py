import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / 'python'))
os.environ['BLENDER_MCP_DISABLE_TELEMETRY'] = 'true'
from blender_mcp.server import main
main()
