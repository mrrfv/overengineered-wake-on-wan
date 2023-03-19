// Load environment variables
import * as dotenv from 'dotenv'
dotenv.config();

import Fastify from 'fastify'
const fastify = Fastify({ logger: true });
import {wake} from 'wol'
import fetch from 'node-fetch';
import fs from 'fs';

// Store index.html in memory for slightly better performance on single-board computers
const indexHTML = fs.readFileSync('static/index.html')

// Determine if HTTPS settings should be passed to Fastify
import { normalize } from 'path'
let additionalFastifyOptions = {}
if (process.env.HTTPS_CERTIFICATE_PATH !== ""
	&& process.env.HTTPS_PRIVATE_KEY_PATH !== ""
	&& fs.existsSync(process.env.HTTPS_CERTIFICATE_PATH)
	&& fs.existsSync(process.env.HTTPS_PRIVATE_KEY_PATH)
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


// Use rate limit
await fastify.register(import('@fastify/rate-limit'), {
  max: 35,
  timeWindow: '10 seconds',
})

// wake route; sends a WoL packet to the target device
fastify.route({
	method: 'GET',
	url: '/wake',
	handler: async (request, reply) => {
		wake(process.env.MAC_ADDRESS, (err, response) => {
			if (err) {
				console.error(err);
				return { message: err.message, success: false }
			}
			return { response, success: true }
		});
	}
});

// status route; checks the status of the target device (requires an HTTP server running on the device)
// TODO: also send ping packets
fastify.route({
	method: 'GET',
	url: '/status',
	handler: async (request, reply) => {
		let web_response;
		let companion_response;

		try {
			web_response = await fetch(process.env.URL_TO_PING, { signal: AbortSignal.timeout(1000) });
		} catch {
			web_response = { ok: false }
		}

		try {
			companion_response = await fetch(process.env.COMPANION_URL + '/ping', { signal: AbortSignal.timeout(1000) });
		} catch {
			companion_response = { ok: false }
		}

		return { web_ok: web_response.ok, companion_ok: companion_response.ok }
	}
});

// Gets server info from target machine
// Note: this endpoint is computationally expensive
fastify.route({
	method: 'GET',
	url: '/proxy/info',
	handler: async (request, reply) => {
		let response = await fetch(process.env.COMPANION_URL + '/info?secret=' + encodeURIComponent(process.env.COMPANION_SECRET), { signal: AbortSignal.timeout(20000) });
		let json = response.json();

		return json;
	}
});

// Verifies server password
fastify.route({
	method: 'POST',
	url: '/proxy/verifyServerPassword',
	schema: {
		body: {
		  type: 'object',
		  required: ['password'],
		  properties: {
			password: { type: 'string' },
		  }
		}
	},
	handler: async (request, reply) => {
		let response = await fetch(process.env.COMPANION_URL + '/verifyServerPassword', {
			signal: AbortSignal.timeout(2500),
			method: 'POST',
			body: JSON.stringify({ password: request.body.password, secret: process.env.COMPANION_SECRET }),
			headers: {
				'Content-Type': 'application/json',
			}
		});
		let json = response.json();

		return json;
	}
});

// Reboots/suspends machine
fastify.route({
	method: 'GET',
	url: '/proxy/power',
	schema: {
		// request needs to have a querystring with `action` parameter
		querystring: {
		  action: { type: 'string' }
		},
		headers: {
			type: 'object',
			required: ['x-owow-server-password'],
			properties: {
			  'x-owow-server-password': { type: 'string' }
			}
		}
	},
	handler: async (request, reply) => {
		let response = await fetch(`${process.env.COMPANION_URL}/power?secret=${encodeURIComponent(process.env.COMPANION_SECRET)}&action=${encodeURIComponent(request.query.action)}`, {
			headers: {
				'x-owow-server-password': request.headers['x-owow-server-password'],
			}
		});
		let json = response.json();

		return json;
	}
});

// Web interface
fastify.route({
	method: 'GET',
	url: '/',
	handler: async (request, reply) => {
		reply.type("text/html").send(indexHTML);
	}
});

// Run the server
const start = async () => {
	try {
	  await fastify.listen({ port: process.env.SERVER_PORT || 3000, host: process.env.SERVER_HOST || '0.0.0.0' });
	} catch (err) {
	  fastify.log.error(err);
	  process.exit(1);
	}
}
start();