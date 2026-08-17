# -*- coding: utf-8 -*-
"""微型創業鳳凰貸款申請書產生器（課程教學版） — 桌面啟動器

打包後的 exe 內含 index.html / manual.html。
執行時在本機 127.0.0.1:8778 啟動靜態伺服器並開啟預設瀏覽器。
固定使用 8778 埠，讓瀏覽器 localStorage（已填的申請書資料）跨次啟動保留。
（8778 埠與工作區其他專案的固定埠不同：8770 一般版、8771 icap、8772 sbir、
8773/8774 ai-video-studio、8775 IPA_Kano、8776 Dashboard、8777 Prompt。）

重建指令見專案 CLAUDE.md。
"""
import http.server
import os
import socket
import sys
import threading
import webbrowser

PORT = 8778
HOST = "127.0.0.1"


def resource_dir() -> str:
    """PyInstaller onefile 解壓目錄；直接執行 .py 時為腳本所在目錄。"""
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def port_in_use() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((HOST, PORT)) == 0


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=resource_dir(), **kwargs)

    def log_message(self, fmt, *args):  # 不在主控台洗 log
        pass


def main() -> None:
    url = f"http://{HOST}:{PORT}/index.html"

    if port_in_use():
        # 多半是程式已在執行中：直接開瀏覽器分頁即可
        print("偵測到產生器已在執行中，開啟瀏覽器頁面…")
        webbrowser.open(url)
        return

    server = http.server.ThreadingHTTPServer((HOST, PORT), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    print("=" * 50)
    print("  微型創業鳳凰貸款申請書產生器（課程教學版）")
    print("=" * 50)
    print()
    print(f"  已啟動：{url}")
    print("  瀏覽器將自動開啟；若沒有，請手動貼上上方網址。")
    print()
    print("  ※ 使用期間請保持此視窗開啟；")
    print("    關閉此視窗即結束程式（已填資料存於瀏覽器，不會遺失）。")
    print()
    print("  ※ AI 優化功能需輸入課程講師提供的授權序號，")
    print("    自序號啟用起提供 4 個月使用期限；計畫書整合、")
    print("    列印匯出等其他功能不受期限限制。")
    print()
    print("  本工具僅供教學、課程及個人使用，")
    print("  禁止未經授權公開發布、販售或商業化使用。  製作：Mark Tsai")
    print()

    webbrowser.open(url)

    try:
        threading.Event().wait()  # 常駐直到視窗被關閉
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
