# Cuidados da Vó: como colocar no ar

App instalável (PWA) para registrar pressão, glicemia, remédios e insulina, compartilhado entre os cuidadores.

| Peça | O que faz | Custo |
|---|---|---|
| GitHub Pages | Hospeda o app (os arquivos desta pasta) | grátis |
| Firebase Authentication | Login por usuário e senha, sem precisar de conta Google | plano gratuito |
| Firebase Firestore | Banco de dados compartilhado, com regras que impedem cuidadores de editar registros | plano gratuito |
| Firebase Cloud Messaging | Entrega a notificação no celular | plano gratuito |
| GitHub Actions | A cada 5 minutos confere os horários e dispara a notificação | grátis em repositório público |

Tempo estimado: 30 a 40 minutos. Os limites e os nomes dos menus do Firebase podem mudar; se algo estiver diferente, procure o item equivalente.

---

## Duas senhas diferentes, não confunda

| | Chave de instalação | Código da família |
|---|---|---|
| Quem usa | só você, administrador | cada cuidador, uma única vez |
| Para que serve | impedir que um estranho vire administrador antes de você | permitir que alguém crie o próprio usuário e senha |
| Onde fica | dentro das regras do Firestore (passo 3) | no banco, criada por você no primeiro acesso (passo 8) |
| Você precisa digitar? | sim, uma vez, no primeiro acesso | não para entrar (você entra com seu usuário e senha); você só escolhe e repassa |

Depois da instalação, a chave de instalação deixa de ter uso. O código da família você pode ver e trocar quando quiser em Ajustes > Administração. Trocar o código não tira quem já tem acesso.

---

## 1. Projeto no Firebase

Entre em <https://console.firebase.google.com> e abra o projeto que você criou. Pode deixar o Google Analytics desligado.

## 2. Ligar o login por usuário e senha

1. Menu **Authentication** > **Vamos começar** > aba **Método de login**.
2. Escolha **E-mail/senha** e ative **só a primeira chave** (E-mail/senha). Não ative "Link por e-mail".
3. Salvar.

O app transforma o usuário que a pessoa digita (por exemplo `maria`) em um e-mail interno (`maria@cuidados-vo.app`). Ninguém precisa ter e-mail, e nenhuma mensagem é enviada.

## 3. Criar o banco e publicar as regras

1. Menu **Firestore Database** > **Criar banco de dados**.
2. Local: `southamerica-east1` (São Paulo). Modo: **produção**.
3. Aba **Regras**: apague o conteúdo, cole o arquivo `firestore.rules` desta pasta.
4. Na regra de `admins`, troque `TROQUE_ESTA_CHAVE` por uma chave só sua (letras e números, sem espaços). **Anote essa chave**: você vai digitá-la uma vez, no primeiro acesso de administrador. Não grave a chave verdadeira nos arquivos do projeto nem no GitHub.
5. **Publicar**.

O que as regras garantem:
- só quem tem o código da família consegue criar acesso;
- qualquer cuidador cria medições e doses, mas **só o administrador corrige ou apaga**;
- o horário de cada registro é o do servidor, então ninguém consegue escolher a data e hora;
- a mesma dose não é registrada duas vezes: se duas pessoas tocarem ao mesmo tempo, a segunda recebe o aviso de que já foi registrada.

## 4. Conectar o app ao Firebase

1. Engrenagem ao lado de "Visão geral do projeto" > **Configurações do projeto** > aba **Geral**.
2. Em **Seus aplicativos**, clique no ícone **</>** (Web). Apelido: `cuidados-vo`. Não marque Hosting.
3. Copie o bloco `firebaseConfig` e cole os valores em `firebase-config.js`.
4. Aba **Cloud Messaging** > **Certificados push da Web** > **Gerar par de chaves**. Copie a chave para `FIREBASE_VAPID_KEY` em `firebase-config.js`.

Esses valores podem ficar no GitHub. Quem protege os dados são as regras do passo 3.

## 5. Chave do robô de lembretes

1. **Configurações do projeto** > aba **Contas de serviço** > **Gerar nova chave privada**. Baixa um arquivo `.json`.
2. **Guarde esse arquivo fora desta pasta e nunca o envie ao GitHub.** Ele dá acesso total ao banco. Você vai colá-lo em um segredo do GitHub no passo 6.

## 6. GitHub

1. Crie um repositório **público** (por exemplo `cuidados-vo`). Público porque o GitHub Actions é ilimitado e gratuito só nesse caso. Não há nada secreto no código.
2. Nesta pasta, no terminal:

```powershell
git init
git add .
git commit -m "Cuidados da Vó"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/cuidados-vo.git
git push -u origin main
```

3. No GitHub: **Settings** > **Pages** > Source: **Deploy from a branch** > Branch `main`, pasta `/ (root)`. Em alguns minutos o endereço aparece: `https://SEU_USUARIO.github.io/cuidados-vo/`.
4. **Settings** > **Secrets and variables** > **Actions** > **New repository secret**. Nome: `FIREBASE_SERVICE_ACCOUNT`. Valor: o conteúdo inteiro do `.json` do passo 5.
5. Aba **Actions**: se pedir, habilite os workflows. Abra **Lembretes de remédio** > **Run workflow** para testar. Deve terminar em verde e escrever "Nada a avisar."

## 7. Autorizar o endereço no Firebase

**Authentication** > aba **Configurações** > **Domínios autorizados** > **Adicionar domínio**: `SEU_USUARIO.github.io`.

## 8. Primeiro acesso do administrador (você)

1. Abra o endereço do GitHub Pages no celular.
2. Toque em **Sou o administrador e vou instalar o app**.
3. Preencha: a chave de instalação do passo 3, o nome da paciente, seu nome, usuário e senha, e o **código da família** que você escolheu para os cuidadores.
4. Pronto. Isso só funciona uma vez. Depois que o banco tem a configuração, ninguém mais consegue se tornar administrador.

## 9. Convidar os cuidadores

Envie o endereço e o código da família. Cada pessoa abre o app, toca em **Primeiro acesso**, escolhe nome, usuário e senha. Para tirar o acesso de alguém: **seu nome no topo** > Ajustes > Administração > **Remover acesso**.

Se alguém esquecer a senha: remova o acesso dessa pessoa e peça para criar outro usuário. Se quiser reaproveitar o mesmo usuário, apague-o antes em **Authentication > Usuários** no Firebase.

## 10. Notificações

São notificações comuns do celular, sem alarme do app. O som e a vibração são os do próprio aparelho, e cada pessoa ajusta isso nas configurações de notificação do celular. Quem não quiser receber toca no seu nome no topo > **Desligar avisos neste aparelho**. Isso vale só para aquele aparelho e não afeta os outros cuidadores.

- **Android (Chrome):** abra o app, toque no seu nome no topo > **Ativar avisos de remédio** e aceite. Para instalar: menu do Chrome > **Instalar app**.
- **iPhone:** precisa de iOS 16.4 ou mais novo, e o Safari. Toque em **Compartilhar** > **Adicionar à Tela de Início**. Abra o app **pelo ícone novo** (não pelo Safari), toque no seu nome > **Ativar avisos de remédio** e aceite. Sem instalar, o iPhone não recebe aviso.
- Teste: cadastre um remédio com horário daqui a uns 10 minutos e aguarde. O aviso vem do robô do GitHub, então pode atrasar.

## 11. Pontos de atenção

- **Atraso dos avisos:** o agendador do GitHub roda "a cada 5 minutos", mas costuma atrasar de 5 a 15 minutos, e às vezes mais. O aviso de remédio atrasado é reenviado 30 minutos depois, se ainda não houver registro.
- **Repositório parado:** o GitHub pausa agendamentos de repositórios públicos sem nenhuma atividade por 60 dias. Se os avisos pararem, faça qualquer commit ou reative o workflow na aba Actions.
- **Fuso horário:** o robô usa o fuso do aparelho do administrador na instalação. Para mudar, edite `config/app` > `tz` no Firestore (por exemplo `America/Cuiaba`).
- **Backup:** o plano gratuito não faz exportação automática do banco. Gere a **planilha** na aba Relatório de vez em quando.
- **Privacidade:** o site é público, mas os dados só abrem para quem tem usuário aprovado. Mesmo assim, são dados de saúde: use senhas fortes.

## Testar no computador, sem Firebase

```powershell
node tools/servir.mjs
```

Abra <http://localhost:5173/__mock> para ver o app com dados de exemplo em memória. A lógica dos horários do robô tem testes:

```powershell
cd lembretes
node teste.mjs
```
