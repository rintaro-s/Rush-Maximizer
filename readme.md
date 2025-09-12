
## 1. 概要
作品名：
**Rush-Maximizer（ラッシュ-マキシマイザー）**
AI を知識で誘導してモノにする新感覚クイズ

## 2. ターゲット
- 小中高校生が「学校の勉強もゲームみたいに楽しい！」って(多分)ワイワイ楽しくできるアプリ
- **最近多い、「一問一答」は得意だが、「説明ができない」人向け**

## 3. 目的・アイデア（めっちゃ大事！）
- プレイヤーが“問題”を考えて、AI を「正解」に導く逆クイズ。
- AIが正解するまで、問題を考える。
- **プログラミングモード**では、お題にそってコードを書き、AIが採点する。

[例]

プレイヤー「1868年に、江戸でいい感じに平和解決した会談の名前は？」

AI「江戸城無血開城です」

→正解

プレイヤー「1860年に、江戸でいい感じに平和解決した会談の名前は？」


AI「1860年（万延元年）3月には大老の井伊直弼が江戸城桜田門外で暗殺されるという「桜田門外の変」が起こっています。これは平和的な解決とは正反対の事件です。」


→不正解


- 正確な出題や誘導が求められるから、自然に覚えちゃう。
- 普通モード or 3 人でオンライン対戦 or 練習モード or プログラミングモード。「AI に一番早く正確に正解させれる」ようにしよう！
<img width="1620" height="915" alt="Screenshot from 2025-08-28 15-25-34" src="https://github.com/user-attachments/assets/4166fc72-a6f1-4f14-890d-bf039d3d8b0c" />


<img width="1620" height="915" alt="image" src="https://github.com/user-attachments/assets/612958da-7566-4588-9665-5fc4b83a08e9" />



## 5. 使用環境と技術
- **LMStudio（ローカル LLM）使用**。クラウドじゃなくて、みんなの環境で安心安全。
- **動作対応**：Windows ／ macOS ／ Linux ／ Android ／ iOS で動くようにweb開発で。サーバーはDockerにまとめる。
- **動作の汎用性**　Github pagesのような静的なサーバーでサイトは運用して、AIやマッチングのサーバーなどはかんたんに自分のパソコンでビルドできるようにする。（学校などのクローズドな環境でも対応）

## 6. 使い方 (How to Start)

このゲームを始めるには、いくつかの準備が必要。

### 1. LMStudioの準備

このゲームはローカルのPCで動くAI（LLM）を使ってる。まずは[LMStudio](https://lmstudio.ai/)を公式サイトからダウンロードして、インストールしてね。

インストールしたら、好きなモデル（LlamaやGemma等。私のおすすめは"Qwen3 30B a3b[q4_k_m]"、VRAM(GPU)15GB+RAM(CPU)10GBで動かしてる）をダウンロードして、**AI Inference Server** を起動しよう。サーバーが起動すると、準備OK！

### 2. Python環境の準備

このゲームのバックエンドはPythonで動いてるよ。まずはPythonがインストールされてるか確認してね。

1. **Pythonのインストール確認**
   ```bash
   python3 --version
   ```
   もしインストールされてなかったら、[Python公式サイト](https://www.python.org/)からダウンロードしてインストールしてね。

2. **仮想環境の作成**
   ```bash
   # プロジェクトのルートディレクトリに移動
   cd /path/to/Rush-Maximizer
   
   # Python仮想環境を作成
   python3 -m venv .venv
   ```

3. **仮想環境のアクティベーション**
   ```bash
   # Linux/macOSの場合
   source .venv/bin/activate
   
   # Windowsの場合
   .venv\Scripts\activate
   ```

4. **依存関係のインストール**
   ```bash
   # 仮想環境がアクティブな状態で
   pip install -r backend/requirements.txt
   ```

### 3. ゲームサーバーの起動

AIと通信するためのゲームサーバーを起動するよ。Dockerっていうのを使うから、持ってない人はインストールしといてね。

1.  このプロジェクトのフォルダを開く。
2.  ターミナル（コマンドプロンプトとか）で、下のコマンドを叩く！

    ```bash
    ./reboot.sh
    ```

3.  なんか色々文字が流れるけど、`Access app at: http://127.0.0.1:9000 (frontend) and API at http://127.0.0.1:8000` みたいのが出たら成功！

4. ブラウザでhttp://localhost:9000 を叩き、サーバーに「http://localhost:8000 」LMstudioアドレスに「http://localhost:1234 」と書いて接続。

5. これで遊べるよ！

音声入力を使用したかったらマイクを許可して使ってね。

### その他
backend/src/data/questions.json
と
frontend/data/programming_questions.json
を編集することで簡単に問題を作成可能。

特定の教科に特化させてホストするのもあり。


## 使用楽曲
SE：
- https://maou.audio/se_system44/
- https://maou.audio/se_system46/
- https://maou.audio/se_system42/
- https://maou.audio/se_system38/

BGM：
- https://dova-s.jp/bgm/play22581.html
- https://dova-s.jp/bgm/play427.html

Music : Anonyment様,魔王魂様

ライセンス(使用条件)：https://maou.audio/rule/ , https://dova-s.jp/_contents/author/profile028.html

