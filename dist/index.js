"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const routes_1 = require("./routes");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const app = (0, express_1.default)();
const log = console.log;
function setupCors(app) {
    app.use((req, res, next) => {
        const origins = new Set();
        if (process.env.REPLIT_DEV_DOMAIN) {
            origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
        }
        if (process.env.REPLIT_DOMAINS) {
            process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
                origins.add(`https://${d.trim()}`);
            });
        }
        const origin = req.header("origin");
        // Allow localhost origins for Expo web development (any port)
        const isLocalhost = (origin === null || origin === void 0 ? void 0 : origin.startsWith("http://localhost:")) ||
            (origin === null || origin === void 0 ? void 0 : origin.startsWith("http://127.0.0.1:"));
        if (origin && (origins.has(origin) || isLocalhost)) {
            res.header("Access-Control-Allow-Origin", origin);
            res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            res.header("Access-Control-Allow-Headers", "Content-Type");
            res.header("Access-Control-Allow-Credentials", "true");
        }
        if (req.method === "OPTIONS") {
            return res.sendStatus(200);
        }
        next();
    });
}
function setupBodyParsing(app) {
    app.use(express_1.default.json({
        verify: (req, _res, buf) => {
            req.rawBody = buf;
        },
    }));
    app.use(express_1.default.urlencoded({ extended: false }));
}
function setupRequestLogging(app) {
    app.use((req, res, next) => {
        const start = Date.now();
        const path = req.path;
        let capturedJsonResponse = undefined;
        const originalResJson = res.json;
        res.json = function (bodyJson, ...args) {
            capturedJsonResponse = bodyJson;
            return originalResJson.apply(res, [bodyJson, ...args]);
        };
        res.on("finish", () => {
            if (!path.startsWith("/api"))
                return;
            const duration = Date.now() - start;
            let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
            if (capturedJsonResponse) {
                logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
            }
            if (logLine.length > 80) {
                logLine = logLine.slice(0, 79) + "…";
            }
            log(logLine);
        });
        next();
    });
}
function getAppName() {
    var _a;
    try {
        const appJsonPath = path.resolve(process.cwd(), "app.json");
        const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
        const appJson = JSON.parse(appJsonContent);
        return ((_a = appJson.expo) === null || _a === void 0 ? void 0 : _a.name) || "App Landing Page";
    }
    catch {
        return "App Landing Page";
    }
}
function serveExpoManifest(platform, res) {
    const manifestPath = path.resolve(process.cwd(), "static-build", platform, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
        return res
            .status(404)
            .json({ error: `Manifest not found for platform: ${platform}` });
    }
    res.setHeader("expo-protocol-version", "1");
    res.setHeader("expo-sfv-version", "0");
    res.setHeader("content-type", "application/json");
    const manifest = fs.readFileSync(manifestPath, "utf-8");
    res.send(manifest);
}
function serveLandingPage({ req, res, landingPageTemplate, appName, }) {
    const forwardedProto = req.header("x-forwarded-proto");
    const protocol = forwardedProto || req.protocol || "https";
    const forwardedHost = req.header("x-forwarded-host");
    const host = forwardedHost || req.get("host");
    const baseUrl = `${protocol}://${host}`;
    const expsUrl = `${host}`;
    log(`baseUrl`, baseUrl);
    log(`expsUrl`, expsUrl);
    const html = landingPageTemplate
        .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
        .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
        .replace(/APP_NAME_PLACEHOLDER/g, appName);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
}
function configureExpoAndLanding(app) {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "landing-page.html");
    const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
    const appName = getAppName();
    log("Serving static Expo files with dynamic manifest routing");
    app.use((req, res, next) => {
        if (req.path.startsWith("/api")) {
            return next();
        }
        if (req.path !== "/" && req.path !== "/manifest") {
            return next();
        }
        const platform = req.header("expo-platform");
        if (platform && (platform === "ios" || platform === "android")) {
            return serveExpoManifest(platform, res);
        }
        if (req.path === "/") {
            return serveLandingPage({
                req,
                res,
                landingPageTemplate,
                appName,
            });
        }
        next();
    });
    app.use("/assets", express_1.default.static(path.resolve(process.cwd(), "assets")));
    app.use(express_1.default.static(path.resolve(process.cwd(), "static-build")));
    log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app) {
    app.use((err, _req, res, next) => {
        const error = err;
        const status = error.status || error.statusCode || 500;
        const message = error.message || "Internal Server Error";
        console.error("Internal Server Error:", err);
        if (res.headersSent) {
            return next(err);
        }
        return res.status(status).json({ message });
    });
}
(async () => {
    setupCors(app);
    setupBodyParsing(app);
    setupRequestLogging(app);
    configureExpoAndLanding(app);
    const server = await (0, routes_1.registerRoutes)(app);
    setupErrorHandler(app);
    const port = parseInt(process.env.PORT || "5000", 10);
    server.listen({
        port,
        host: "0.0.0.0",
        reusePort: true,
    }, () => {
        log(`express server serving on port ${port}`);
    });
})();
