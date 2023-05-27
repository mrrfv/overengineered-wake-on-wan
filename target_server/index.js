// Load environment variables
import * as dotenv from 'dotenv'
dotenv.config();

// Check if the required environment variables are set
const requiredEnvVars = [
	"COMPANION_SECRET",
	"SERVER_PASSWORD",
	"HTTPS_CERTIFICATE_PATH",
	"HTTPS_PRIVATE_KEY_PATH",
	"HTTPS_ALLOW_HTTP1"
]

requiredEnvVars.forEach(envVar => {
	if (process.env[envVar] === undefined) {
        throw new Error(`Required environment variable ${envVar} not set`);
		process.exit(1);
    }
	// console.log(`Found environment variable ${envVar} = ${process.env[envVar]}`)
});

// Determine if HTTPS settings should be passed to Fastify
import { normalize } from 'path'
import fs from 'fs'
let additionalFastifyOptions = {}
if (process.env.HTTPS_CERTIFICATE_PATH !== ""
	&& process.env.HTTPS_PRIVATE_KEY_PATH !== ""
	&& fs.existsSync(normalize(process.env.HTTPS_CERTIFICATE_PATH))
	&& fs.existsSync(normalize(process.env.HTTPS_PRIVATE_KEY_PATH))
) {
	console.log("Valid HTTPS settings found in environment variables. Using HTTPS");
	additionalFastifyOptions = {
		// Use HTTP2 if HTTPS is enabled
		http2: true,
		https: {
			allowHTTP1: process.env.HTTPS_ALLOW_HTTP1 === "true" ? true : false, // there's a better way to do this...
			key: fs.readFileSync(normalize(process.env.HTTPS_PRIVATE_KEY_PATH)),
			cert: fs.readFileSync(normalize(process.env.HTTPS_CERTIFICATE_PATH))
		}
	}
} else {
	console.log("WARNING: HTTPS settings invalid or unset. Unencrypted HTTP will be used.");
	console.log("This is not a problem if you are using a VPN such as Tailscale or ZeroTier.")
}

import Fastify from 'fastify'
const fastify = Fastify({
	logger: true,
	...additionalFastifyOptions,
});
import * as si from 'systeminformation'
import argon2 from 'argon2';
import { spawn } from 'child_process'

// get operating system information
const os = (await si.osInfo()).platform;
console.log(`Running on ${os}`);

// sleep function
const sleep = ms => new Promise(res => setTimeout(res, ms));

// set up rate limting
await fastify.register(import('@fastify/rate-limit'), {
	max: 30,
	timeWindow: '10 seconds'
})

// info route; gets info of the target device
fastify.route({
	method: 'GET',
	url: '/info',
	schema: {
		// request needs to have a header with a `x-owow-secret` parameter
		headers: {
			type: 'object',
			required: ['x-owow-secret'],
			properties: {
			  'x-owow-secret': { type: 'string' }
			}
		}
	},
	// this function is executed for every request before the handler is executed
	preHandler: async (request, reply) => {
		if (request.headers["x-owow-secret"] !== process.env.COMPANION_SECRET) {
			return reply.code(401).send({ error: 'Unauthorized - invalid secret' });
		}

		if (process.env.DISABLE_INFO === "true") {
			return reply.code(400).send({ error: "The info route is disabled. Check your server configuration." })
		}
	},
	handler: async (request, reply) => {
		let system_info = await si.system();
		let cpu_info = await si.cpu();
		let ram_info = await si.mem();

		return { system_info, cpu_info, ram_info }
	}
});

// allows sleeping or rebooting this machine
fastify.route({
	method: 'GET',
	url: '/power',
	schema: {
		// request needs to have a querystring with `action` parameter
		querystring: {
		  action: { type: 'string' }
		},
		headers: {
			type: 'object',
			required: ['x-owow-server-password', 'x-owow-secret'],
			properties: {
			  'x-owow-server-password': { type: 'string' },
			  'x-owow-secret': { type: 'string' }
			},
		}
	},
	// this function is executed for every request before the handler is executed
	preHandler: async (request, reply) => {		
		// verify server password
		const isServerPasswordCorrect = await argon2.verify(process.env.SERVER_PASSWORD, request.headers["x-owow-server-password"]);
		if (!isServerPasswordCorrect) {
			return reply.code(401).send({ error: 'Unauthorized - invalid server password' });
		}

		// check if the secret provided by the Pi is correct
		if (request.headers["x-owow-secret"] !== process.env.COMPANION_SECRET) {
			return reply.code(401).send({ error: 'Unauthorized - invalid secret' });
		}

		if (request.query.action !== "reboot" && request.query.action !== "sleep") {
			return reply.code(500).send({ error: "Invalid action." })
		}

		if (request.query.action == "sleep" && process.env.DISABLE_SLEEP == "true") {
			return reply.code(400).send({ error: "Sleep is disabled." })
		}

		if (request.query.action == "reboot" && process.env.DISABLE_REBOOT == "true") {
			return reply.code(400).send({ error: "The reboot action is disabled." })
		}
	},
	handler: async (request, reply) => {
		// Windows
		if (os.toLowerCase().includes("win")) { // todo: this will also match darwin (macos)
			if (request.query.action === "sleep") {
				reply.send({ response: "System will be suspended in 5 seconds" });
				await sleep(5000);
				spawn("rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]);
			} else 	if (request.query.action === "reboot") {
				reply.send({ response: "System will be rebooted in 5 seconds" });
				await sleep(5000);
				spawn("shutdown.exe", ["/r"]);
			}
		// Linux
		} else if (os.toLowerCase().includes("linux")) { // todo: check if this works
			if (request.query.action === "sleep") {
				reply.send({ response: "System will be suspended in 5 seconds" });
				await sleep(5000);
				spawn("systemctl", ["suspend"]);
			} else 	if (request.query.action === "reboot") {
				reply.send({ response: "System will be rebooted in 5 seconds" });
				await sleep(5000);
				spawn("shutdown", ["-r"]);
			}
		}
	}
});

fastify.route({
	method: 'POST',
	url: '/verifyServerPassword',
	schema: {
	  body: {
		type: 'object',
		required: ['password'],
		properties: {
		  password: { type: 'string' },
		}
	  },
	  headers: {
		type: 'object',
		required: ['x-owow-secret'],
		properties: {
		  'x-owow-secret': { type: 'string' }
		},
	}
	},
	// this function is executed for every request before the handler is executed
	preHandler: async (request, reply) => {
		// check if the secret provided by the Pi is correct
		if (request.headers["x-owow-secret"] !== process.env.COMPANION_SECRET) {
			return reply.code(401).send({ error: 'Unauthorized - invalid secret' });
		}
	},
	handler: async function (request, reply) {
		const { password } = request.body;
		// verify server password
		const result = await argon2.verify(process.env.SERVER_PASSWORD, password);
		return { result: result }
	}
});

// ping
if (process.env.DISABLE_PING !== "true") {
	fastify.route({
		method: 'GET',
		url: '/ping',
		handler: async (request, reply) => {
			return { pong: true, whoami: "Overengineered Wake On WAN by github.com/mrrfv" }
		}
	});
} else {
	console.log("Ping is disabled, not adding route.");
}

// Run the server
const start = async () => {
	try {
	  await fastify.listen({ port: process.env.SERVER_PORT || 4617, host: process.env.SERVER_HOST || '0.0.0.0' });
	} catch (err) {
	  fastify.log.error(err);
	  process.exit(1);
	}
}
start();