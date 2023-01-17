// Load environment variables
import * as dotenv from 'dotenv'
dotenv.config();

import Fastify from 'fastify'
const fastify = Fastify({ logger: true });
import * as si from 'systeminformation'
import { spawn } from 'child_process'

// get operating system information
const os = (await si.osInfo()).platform;
console.log(`Running on ${os}`);

// sleep command
const sleep = ms => new Promise(res => setTimeout(res, ms));

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
	  await fastify.listen({ port: 4617, host: '0.0.0.0' });
	} catch (err) {
	  fastify.log.error(err);
	  process.exit(1);
	}
}
start();