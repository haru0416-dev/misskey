# misskey-js

ブラウザ、Node.js、Bun で動く、API とストリーミングの TypeScript SDK です。

このリポジトリのワークスペースの内部で使うパッケージで、npm には公開していません。`npm i misskey-js` で入るのは upstream の [misskey-dev/misskey.js](https://github.com/misskey-dev/misskey.js) で、このパッケージではありません。

`src/autogen/` の型は、バックエンドの API の定義から生成しています。バックエンドの API を変えたら、リポジトリのルートで `bun run build-misskey-js-with-types` を実行してください。開発の決まりは [CONTRIBUTING.md](./CONTRIBUTING.md) にあります。

提供するものは次のとおりです。

- API のリクエスト(`api.APIClient`)
- ストリーミング(`Stream`)
- ユーティリティ(`acct`、`note`、`nyaize`)
- エンティティと API の型(`entities`、`Endpoints`、`Channels`)
- 定数(`permissions`、`notificationTypes`、`noteVisibilities` など)

## 使い方

次のようにまとめて import できます。以降の例は、この形で import している前提です。

```ts
import * as Misskey from 'misskey-js';
```

この形ではツリーシェイキングが効かないので、コードのサイズが重要な場合は、個別に import します。

```ts
import { api as misskeyApi } from 'misskey-js';
```

## 認証

API とストリーミングには、アクセストークンを渡します。トークンは、設定の「連携」のページ(`/settings/connect`)で発行するか、MiAuth(`miauth/gen-token`)で取得します。

## API のリクエスト

利用するサーバーの `origin` と、アクセストークン(`credential`)を渡して `APIClient` を作り、`request` を呼びます。`credential` は省略すると、認証なしのリクエストになります。

```ts
const client = new Misskey.api.APIClient({
	origin: 'https://example.tld',
	credential: 'TOKEN',
});

const meta = await client.request('meta', { detail: true });
```

`request` の引数は、エンドポイント名、パラメータのオブジェクトの順です。3 番目に、このリクエストだけに使う `credential` を、4 番目に中断用の `AbortSignal` を渡せます。結果は Promise で返ります。エンドポイント名から、パラメータと結果の型が決まります。

エラーは `Misskey.api.APIError` として投げられます。`Misskey.api.isAPIError(error)` で判別できます。

## ストリーミング

ストリーミングには、2 つのクラスがあります。接続そのものを持つ `Stream` と、接続の上のチャンネルを表す `ChannelConnection` です。`Stream` を作り、`useChannel` でチャンネルに接続します。

```ts
const stream = new Misskey.Stream('https://example.tld', { token: 'TOKEN' });
const main = stream.useChannel('main');
main.on('notification', (notification) => {
	console.log('notification received', notification);
});
```

`Stream` の第 2 引数は、`{ token }` か、認証なしの場合の `null` です。接続が切れると、自動で再接続します。

### チャンネルに接続する

パラメータのないチャンネルは、名前だけを渡します。

```ts
const main = stream.useChannel('main');
```

パラメータのあるチャンネルは、第 2 引数に渡します。

```ts
const chat = stream.useChannel('chatUser', { otherId: 'xxxxxxxxxx' });
```

チャンネルの名前、パラメータ、受け取るイベント、送れるメッセージは、`Channels` の型にあります。

### チャンネルから切断する

`dispose` を呼びます。

```ts
main.dispose();
```

### メッセージを受け取る

`ChannelConnection` は EventEmitter を継承しています。サーバーからメッセージが届くと、そのイベント名でペイロードを `emit` します。

```ts
main.on('notification', (notification) => {
	console.log('notification received', notification);
});
```

### メッセージを送る

`send` で、サーバーにメッセージを送れます。

```ts
chat.send('read', { id: 'xxxxxxxxxx' });
```

### 接続のイベント

`Stream` は、接続が確立したときに `_connected_`、切れたときに `_disconnected_` を `emit` します。

```ts
stream.on('_connected_', () => {
	console.log('connected');
});
stream.on('_disconnected_', () => {
	console.log('disconnected');
});
```

### 接続の状態

`Stream` の `state` で確かめられます。

| 値 | 意味 |
| --- | --- |
| `initializing` | 接続を確立する前 |
| `connected` | 接続が完了している |
| `reconnecting` | 再接続している |
