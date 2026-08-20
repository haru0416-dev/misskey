## test-federation
Test federation between two Misskey servers: `a.test` and `b.test`.

The suite also parses public actor and note documents with `@fedify/vocab`.
This keeps the validation independent from Misskey's own ActivityPub parser and
covers actor endpoints and keys, ordinary notes and replies, and poll questions.

Before testing, you need to build the entire project, and change working directory to here:
```sh
bun run build
cd packages/backend/test-federation
```

First, you need to start servers by executing following commands:
```sh
bash ./setup.sh
BUN_VERSION=1.4.0 docker compose up --scale tester=0
```

Then you can run all tests by a following command:
```sh
BUN_VERSION=1.4.0 docker compose run --no-deps --rm tester
```

For testing a specific file, run a following command:
```sh
BUN_VERSION=1.4.0 docker compose run --no-deps --rm tester -- bun run --bun --filter backend test:fed test-federation/test/user.test.ts
```
