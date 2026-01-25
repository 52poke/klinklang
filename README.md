klinklang
=========

A collection of utilities and automation tools for [52Poké Wiki](https://wiki.52poke.com/).

## Features

*   **Workflow Automation**: A visual bot engine to define and execute tasks on 52Poké Wiki (inspired by Amazon States Language).
*   **Terminology Management**: A database for translating and managing Pokémon terminologies across multiple languages.
*   **Integrations**: Connects the Wiki with Discord and the Fediverse for notifications and community updates.

## Architecture

This project is a monorepo managed by `pnpm`, featuring:

*   **Frontend** (`packages/klinklang-client`): Built with React 19, Vite, Tailwind CSS v4, and shadcn/ui.
*   **Backend** (`packages/klinklang-server`): Powered by Node.js, Fastify, and BullMQ for Redis-backed job queues.
*   **Database**: PostgreSQL accessed via Prisma ORM.

## Development

1.  Install dependencies:
    ```bash
    pnpm install
    ```

2.  Start the development environment (starts both client and server):
    ```bash
    pnpm start
    ```

## See also

*   [52Poké Wiki Toolkits](https://github.com/lucka-me/toolkit/tree/master/52Pok%C3%A9-Wiki) by lucka-me

## LICENSE

This project is under [BSD-3-Clause](LICENSE).

52Poké (神奇宝贝部落格/神奇寶貝部落格, 神奇宝贝百科/神奇寶貝百科) is a Chinese-language Pokémon fan site. Neither the name of 52Poké nor the names of the contributors may be used to endorse any usage of codes under this project.

Pokémon ©2026 Pokémon. ©1995-2026 Nintendo/Creatures Inc./GAME FREAK inc. 52Poké and this project is not affiliated with any Pokémon-related companies.
