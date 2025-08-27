# Pythonの公式イメージをベースにする
FROM python:3.9-slim

# 作業ディレクトリを設定
WORKDIR /app

# 依存関係をrequirements.txtからインストール
COPY ./backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションのコードをコピー
COPY ./backend/src /app

# サーバーを起動するコマンド
# host 0.0.0.0 でコンテナの外からアクセスできるようにする
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]