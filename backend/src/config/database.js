"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseConfig = void 0;
var index_js_1 = require("./index.js");
exports.databaseConfig = {
    client: "pg",
    connection: {
        host: index_js_1.config.POSTGRES_HOST,
        port: index_js_1.config.POSTGRES_PORT,
        database: index_js_1.config.POSTGRES_DB,
        user: index_js_1.config.POSTGRES_USER,
        password: index_js_1.config.POSTGRES_PASSWORD,
        // Keep connections alive
        keepAlive: true,
    },
    pool: {
        min: 2,
        max: 20,
        // Destroy idle connections after 30s
        idleTimeoutMillis: 30000,
        // Fail fast if pool is exhausted
        acquireTimeoutMillis: 10000,
        // Validate connection before use
        afterCreate: function (conn, done) {
            conn.query("SET timezone='UTC'", function (err) { return done(err, conn); });
        },
    },
    migrations: {
        directory: "./src/database/migrations",
        tableName: "knex_migrations",
        extension: "ts",
        loadExtensions: [".ts", ".js"],
    },
    seeds: {
        directory: "./src/database/seeds",
        extension: "ts",
        loadExtensions: [".ts", ".js"],
    },
};
