"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storage = exports.MemStorage = void 0;
const crypto_1 = require("crypto");
class MemStorage {
    constructor() {
        this.users = new Map();
    }
    async getUser(id) {
        return this.users.get(id);
    }
    async getUserByUsername(username) {
        return Array.from(this.users.values()).find((user) => user.username === username);
    }
    async createUser(insertUser) {
        const id = (0, crypto_1.randomUUID)();
        const user = { ...insertUser, id };
        this.users.set(id, user);
        return user;
    }
}
exports.MemStorage = MemStorage;
exports.storage = new MemStorage();
