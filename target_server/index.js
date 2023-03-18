// Load environment variables
import * as dotenv from 'dotenv'
dotenv.config();

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
		// request needs to have a querystring with a `secret` parameter
		querystring: {
		  secret: { type: 'string' }
		},
	},
	// this function is executed for every request before the handler is executed
	preHandler: async (request, reply) => {
		if (request.query.secret !== process.env.COMPANION_SECRET) {
			return reply.code(401).send({ error: 'Unauthorized - invalid secret' });
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
		// request needs to have a querystring with `action` and `secret` parameters
		querystring: {
		  secret: { type: 'string' },
		  action: { type: 'string' }
		},
	},
	// this function is executed for every request before the handler is executed
	preHandler: async (request, reply) => {
		if (request.query.secret !== process.env.COMPANION_SECRET) {
			return reply.code(401).send({ error: 'Unauthorized - invalid secret' });
		}

		if (request.query.action !== "reboot" && request.query.action !== "sleep") {
			return reply.code(500).send({ error: "Invalid action." })
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

// ping
fastify.route({
	method: 'GET',
	url: '/ping',
	handler: async (request, reply) => {
		return { pong: true, whoami: "Overengineered Wake On WAN by github.com/mrrfv" }
	}
});

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