@echo off
rem The focus-notes command (D-165): the app's own executable runs it with --cli.
"%~dp0..\..\focus-notes.exe" --cli %*
exit /b %ERRORLEVEL%
