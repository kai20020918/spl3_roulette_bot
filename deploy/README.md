# Ubuntu VPSへの配置

この手順のコマンドはVPS上のUbuntuで実行します。
Node.js 24とnpm、Gitを導入し、`node --version` が `v24.*` になることを確認してください。
Node.jsの導入方法は [公式ダウンロード手順](https://nodejs.org/en/download) を参照してください。
Node.jsは後で作成する `spl3bot` ユーザーからも実行できる配置にします。
管理者のホーム内のnvmだけにインストールしたNode.jsは使用しないでください。

## 初回配置

```bash
sudo useradd --system --create-home --home-dir /var/lib/spl3bot --shell /usr/sbin/nologin spl3bot
sudo install -d -o spl3bot -g spl3bot -m 0750 /opt/spl3-roulette-bot
sudo -u spl3bot git clone https://github.com/kai20020918/spl3_roulette_bot.git /opt/spl3-roulette-bot
cd /opt/spl3-roulette-bot
sudo -u spl3bot env PATH=/opt/node-v24.19.0-linux-x64/bin:/usr/bin:/bin npm ci --include=dev
sudo -u spl3bot env PATH=/opt/node-v24.19.0-linux-x64/bin:/usr/bin:/bin npm test
```

既存のユーザーや配置先がある場合は再作成せず、その状態を確認してください。
リポジトリが非公開の場合は、VPS側にGitHubの読み取り用Deploy Keyなどを別途設定します。
Windowsの `node_modules` や `.env` はコピーしません。

本番用の `.env` をVPS上で作成します。既存ファイルがあれば上書きせず確認してください。

```bash
sudo -u spl3bot cp -n .env.example .env
sudo chmod 600 .env
sudo -u spl3bot nano .env
```

Token・Application ID・サーバーIDを入力してください。TokenはチャットやGitへ送らないでください。
開発Botと本番Botで同じTokenを使う場合、Windows側のBotを `Ctrl+C` で停止してから本番を起動します。
同じTokenで複数のプロセスを稼働させると、パネルのメモリ状態が共有されず操作が競合します。

コマンド登録先を変える場合やコマンド定義を変更した場合のみ、次を実行します。

```bash
sudo -u spl3bot env PATH=/opt/node-v24.19.0-linux-x64/bin:/usr/bin:/bin npm run deploy:commands
```

## systemdによる常時稼働

```bash
command -v node
sudo cp deploy/spl3-roulette-bot.service /etc/systemd/system/spl3-roulette-bot.service
sudo nano /etc/systemd/system/spl3-roulette-bot.service
```

`ExecStart` の `/opt/node-v24.19.0-linux-x64/bin/node` を実際のNode.js 24の絶対パスに変更します。
サービスユーザーが実行できることを確認します。

```bash
sudo -u spl3bot /opt/node-v24.19.0-linux-x64/bin/node --version
sudo systemd-analyze verify /etc/systemd/system/spl3-roulette-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now spl3-roulette-bot
sudo systemctl status spl3-roulette-bot --no-pager
sudo journalctl -u spl3-roulette-bot -n 50 --no-pager
```

上記の `/opt/node-v24.19.0-linux-x64/bin/node` も実際のパスに置き換えてください。
サービスは異常終了時に再起動し、VPS起動時にも自動起動します。
ログにDiscordへのログイン成功が出たら `/ping` とVC内からの `/roulette` を確認します。
SSHを切断してもBotは稼働を続けます。
受信用のWebサーバーはないので、Bot用に新しい受信ポートを開ける必要はありません。

## 更新

```bash
cd /opt/spl3-roulette-bot
sudo systemctl stop spl3-roulette-bot
sudo -u spl3bot git pull --ff-only origin main
sudo -u spl3bot env PATH=/opt/node-v24.19.0-linux-x64/bin:/usr/bin:/bin npm ci --include=dev
sudo -u spl3bot env PATH=/opt/node-v24.19.0-linux-x64/bin:/usr/bin:/bin npm test
sudo systemctl start spl3-roulette-bot
sudo systemctl status spl3-roulette-bot --no-pager
```

途中でエラーが出たら後続の起動は実行せず、原因を解消してください。
`npm test` はビルドも行います。TypeScriptのビルド用に開発依存関係が必要なため、
インストール時は `--include=dev` を指定します。
再起動すると、既存の条件パネルは期限切れになります。新しく `/roulette` を実行してください。

## 停止・ログ確認

```bash
sudo systemctl stop spl3-roulette-bot
sudo systemctl restart spl3-roulette-bot
sudo journalctl -u spl3-roulette-bot -f
```

systemd設定の参考: [systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
