' Video Notes - Headless Chrome Live Caption Bridge Runner
' Runs the caption bridge daemon silently in the background with ZERO terminal windows.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
strBridgeScript = strScriptDir & "\caption_bridge.py"

' Run via pythonw.exe or python.exe in completely hidden mode (0, False)
strCmd = "cmd.exe /c python """ & strBridgeScript & """"
WshShell.Run strCmd, 0, False

WScript.Echo "Chrome Live Caption Bridge is now running silently in the background on ws://127.0.0.1:8765." & vbCrLf & "No terminal window needed! To stop it, run companion\stop_bridge.bat."
