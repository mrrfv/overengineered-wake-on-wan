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
			web_response = await fetch(process.env.URL_TO_PING, { signal: AbortSignal.timeout(5000) });
		} catch {
			web_response = { ok: false }
		}

		try {
			companion_response = await fetch(process.env.COMPANION_URL + '/ping', { signal: AbortSignal.timeout(5000) });
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

// Reboots/suspends machine
fastify.route({
	method: 'GET',
	url: '/proxy/power',
	schema: {
		// request needs to have a querystring with `action` parameter
		querystring: {
		  action: { type: 'string' }
		},
	},
	handler: async (request, reply) => {
		let response = await fetch(`${process.env.COMPANION_URL}/power?secret=${encodeURIComponent(process.env.COMPANION_SECRET)}&action=${encodeURIComponent(request.query.action)}`);
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