!ifndef BUILD_UNINSTALLER
  !macro customInstallMode
    ${If} ${isUpdated}
      # Use the template's forced-mode branches to skip the picker and preserve elevation.
      ${If} $hasPerUserInstallation == "1"
      ${AndIf} $hasPerMachineInstallation == "0"
        StrCpy $isForceCurrentInstall "1"
      ${ElseIf} $hasPerMachineInstallation == "1"
      ${AndIf} $hasPerUserInstallation == "0"
        StrCpy $isForceMachineInstall "1"
      ${Else}
        # Do not switch scopes or remove a second copy when updating from the app.
        StrCpy $0 "Cannot identify which Asterism installation to update. Run the installer manually."
        ${If} $LANGUAGE == 2052
          StrCpy $0 "无法确定要更新哪份 Asterism。请手动运行安装程序。"
        ${ElseIf} $LANGUAGE == 1028
          StrCpy $0 "無法確定要更新哪份 Asterism。請手動執行安裝程式。"
        ${EndIf}
        MessageBox MB_OK|MB_ICONSTOP "$0"
        SetErrorLevel 2
        Quit
      ${EndIf}
    ${EndIf}
  !macroend

  !macro customFinishPage
    Function LaunchInstalledAsterism
      ${If} ${isUpdated}
        StrCpy $1 "--updated"
      ${Else}
        StrCpy $1 ""
      ${EndIf}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !ifndef HIDE_RUN_AFTER_FINISH
      !define MUI_FINISHPAGE_RUN
      !define MUI_FINISHPAGE_RUN_FUNCTION "LaunchInstalledAsterism"
    !endif
    !insertmacro skipPageIfUpdated
    !insertmacro MUI_PAGE_FINISH

    Function .onInstSuccess
      # The template already handles relaunch for silent updates.
      ${If} ${isUpdated}
      ${AndIfNot} ${Silent}
        HideWindow
        Call LaunchInstalledAsterism
      ${EndIf}
    FunctionEnd
  !macroend
!endif
