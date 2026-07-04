import { app, BrowserWindow } from "electron";
import * as path from "path";
import isDev from "electron-is-dev";
import { fork, ChildProcess } from "child_process";

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

function startServer() {
  // Em produção, apontamos para o bundle do servidor gerado pelo build
  const serverPath = isDev 
    ? path.join(__dirname, "server.ts") 
    : path.join(process.resourcesPath, "dist", "server.cjs");

  const execPath = isDev ? "npx" : "node";
  const args = isDev ? ["tsx", serverPath] : [serverPath];

  serverProcess = fork(serverPath, [], {
    env: { ...process.env, NODE_ENV: isDev ? "development" : "production" },
    stdio: "inherit"
  });

  serverProcess.on("exit", (code) => {
    console.log(`Servidor encerrado com código ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Shopee Bot WhatsApp",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, "assets", "icon.png") // Opcional
  });

  const startUrl = "http://localhost:3000";

  mainWindow.loadURL(startUrl);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", () => {
  startServer();
  // Aguarda um pouco para o servidor subir antes de abrir a janela
  setTimeout(createWindow, 3000);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (serverProcess) serverProcess.kill();
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});
