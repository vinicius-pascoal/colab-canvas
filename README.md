# Canvas Colaborativo 🎨

Canvas colaborativo em tempo real usando Ably WebSocket, permitindo que múltiplos usuários desenhem simultaneamente no mesmo canvas.

## 🚀 Tecnologias

### Frontend
- **Next.js 14** com TypeScript
- **Tailwind CSS** para estilização
- **Ably** para WebSocket em tempo real
- **React Hooks** para gerenciamento de estado

### Backend
- **Node.js** com Express e TypeScript
- **Ably REST API** para autenticação e estatísticas
- **CORS** configurado para comunicação segura

### DevOps
- **Docker** e **Docker Compose** para containerização
- Configuração para desenvolvimento e produção

## 📋 Pré-requisitos

- Node.js 20+ ou Docker
- Conta no [Ably](https://ably.com/) (plano gratuito disponível)

## 🔑 Configuração do Ably

1. Crie uma conta gratuita em [https://ably.com/](https://ably.com/)
2. Acesse o dashboard e crie um novo app
3. Copie a API Key (formato: `xxxx.xxxxxx:xxxxxxxxx`)

## ⚙️ Instalação

### Opção 1: Com Docker (Recomendado)

1. Clone o repositório:
```bash
git clone <repository-url>
cd colab-canvas
```

2. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

3. Edite o arquivo `.env` e adicione sua chave do Ably:
```env
ABLY_API_KEY=sua_chave_aqui
```

4. Inicie os containers:
```bash
docker-compose up --build
```

5. Acesse a aplicação:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

### Opção 2: Sem Docker

#### Backend

```bash
cd backend
cp .env.example .env
# Edite o .env com sua chave Ably
npm install
npm run dev
```

#### Frontend

```bash
cd frontend
cp .env.local.example .env.local
# Edite o .env.local com sua chave Ably
npm install
npm run dev
```

## 🎮 Como Usar

1. Abra o navegador em `http://localhost:3000`
2. Abra múltiplas janelas/abas para simular vários usuários
3. Desenhe no canvas e veja as mudanças em tempo real em todas as janelas
4. Use os controles para:
   - **Cor**: Escolher a cor do pincel
   - **Espessura**: Ajustar a espessura da linha (1-20px)
   - **Limpar**: Limpar o canvas para todos os usuários
5. Veja o status de conexão e número de usuários online no canto superior direito

## 🏗️ Estrutura do Projeto

```
colab-canvas/
├── frontend/                 # Aplicação Next.js
│   ├── src/
│   │   ├── app/             # App Router do Next.js
│   │   │   ├── globals.css  # Estilos globais
│   │   │   ├── layout.tsx   # Layout principal
│   │   │   └── page.tsx     # Página inicial
│   │   └── components/
│   │       └── Canvas.tsx   # Componente principal do canvas
│   ├── Dockerfile
│   ├── package.json
│   └── tailwind.config.ts
│
├── backend/                  # API Node.js/Express
│   ├── src/
│   │   └── server.ts        # Servidor Express com Ably
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── docker-compose.yml        # Orquestração dos containers
├── .env.example             # Exemplo de variáveis de ambiente
└── README.md                # Este arquivo
```

## 🔌 Endpoints da API

### `GET /health`
Verifica se o servidor está funcionando
```json
{
  "status": "ok",
  "timestamp": "2025-12-26T..."
}
```

### `POST /auth/token`
Gera token Ably para autenticação (opcional)
```json
{
  "clientId": "user-id"
}
```

### `GET /canvas/stats`
Retorna estatísticas do canvas
```json
{
  "occupancy": { ... },
  "timestamp": "2025-12-26T..."
}
```

## 🌐 Eventos WebSocket (Ably)

O projeto usa o canal `canvas-draw` com os seguintes eventos:

### `draw`
Enviado quando um usuário desenha
```typescript
{
  x: number,
  y: number,
  prevX: number,
  prevY: number,
  color: string,
  lineWidth: number,
  userId: string
}
```

### `clear`
Enviado quando o canvas é limpo
```typescript
{
  userId: string
}
```

### Presença
O Ably gerencia automaticamente a presença de usuários no canal, permitindo ver quantos usuários estão online.

## 🎨 Funcionalidades

- ✅ Desenho colaborativo em tempo real
- ✅ Múltiplos usuários simultâneos
- ✅ Seleção de cor personalizada
- ✅ Ajuste de espessura do traço
- ✅ Limpar canvas (sincronizado)
- ✅ Contador de usuários online
- ✅ Indicador de status de conexão
- ✅ Interface responsiva com Tailwind CSS
- ✅ Suporte a modo claro/escuro

## 🐳 Comandos Docker Úteis

```bash
# Iniciar containers
docker-compose up

# Iniciar em background
docker-compose up -d

# Rebuild dos containers
docker-compose up --build

# Parar containers
docker-compose down

# Ver logs
docker-compose logs -f

# Ver logs de um serviço específico
docker-compose logs -f frontend
docker-compose logs -f backend
```

## 🛠️ Desenvolvimento

### Frontend
```bash
cd frontend
npm run dev      # Inicia servidor de desenvolvimento
npm run build    # Build de produção
npm run start    # Inicia servidor de produção
npm run lint     # Executa linter
```

### Backend
```bash
cd backend
npm run dev      # Inicia servidor com hot-reload
npm run build    # Compila TypeScript
npm run start    # Inicia servidor compilado
```

## 🔒 Segurança

Para produção, considere:
- Usar token de autenticação Ably ao invés da API key diretamente no frontend
- Implementar rate limiting
- Adicionar validação de dados
- Configurar HTTPS
- Implementar autenticação de usuários

## 📝 Licença

Este projeto é de código aberto e está disponível sob a licença MIT.

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para:
1. Fazer fork do projeto
2. Criar uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abrir um Pull Request

## 📧 Contato

Para dúvidas ou sugestões, abra uma issue no repositório.
