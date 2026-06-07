@echo off
chcp 65001 > nul
echo ========================================
echo  Vectorlab ビルド
echo ========================================
echo.

echo [1/2] PyInstaller をインストール中...
pip install pyinstaller --quiet
if errorlevel 1 (
    echo エラー: pip が失敗しました。
    pause & exit /b 1
)

echo [2/2] EXE をビルド中...
pyinstaller vectorlab.spec --noconfirm
if errorlevel 1 (
    echo.
    echo エラー: ビルドに失敗しました。上記のログを確認してください。
    pause & exit /b 1
)

echo.
echo ========================================
echo  完了: dist\Vectorlab.exe
echo  このファイルを配布してください。
echo ========================================
pause
