# Overengineered Wake on WAN (OWoW)

An easy-to-use web application that allows for **remote waking**, monitoring, **suspending and rebooting** of your home server/computer.

## Why?

- Save energy by suspending your server when it's unused. When needed, wake it anywhere.
- Accidentally shut down your server over SSH? Turn it back on without having to walk up to it.
- Compared to [PiKVM](https://github.com/pikvm/pikvm), this app doesn't require buying a video capture device, saving you money if KVM features aren't needed.

## This Is Experimental Software

Whilst I do use this myself, there are lots of things that have to be improved before I'd consider this fully usable without the need for some kind of "plan B" in case the app breaks and doesn't wake your PC when you're in another country. Don't use this for mission critical systems or if you cannot troubleshoot issues on your own.

## How it works

![How it works](.github/images/how_it_works.png)

OWoW consists of two Node.js web applications that connect to each other and allow for remote waking and monitoring of your system.

- The first (pi) web application, located in the `pi_server` directory, is meant to be run on a single-board computer that's always on and connected to a VPN such as ZeroTier or Tailscale. It exposes the web interface for OWoW and allows for control of your machine anywhere - even when it's turned off.
- The second (target, also called "companion") web application located in the `target_server` directory, is meant to be run on the computer you want to control. It exposes the endpoints used to get system information as well as reboot/suspend your machine to the first web app.

## Support

Windows servers fully supported. Linux support is untested and might require the companion server to be run as root.

## Installation

### You need

- a Raspberry Pi (a Zero works just fine, and is even preferred for its extremely low power consumption)
- a PC with Wake on LAN enabled, and the MAC address of its Ethernet interface
- Tailscale or ZeroTier installed on both the Pi and target machine to improve security and ensure better stability

### Installation of the target server on the computer you want to monitor

1. Install Node.js and npm.
2. Clone this repository to a place where you won't accidentally delete it and navigate to `./target_server` in a terminal.
3. Copy `example.env` to `.env`.
4. Edit `.env` to match your system: change the value of `COMPANION_SECRET` to a secure password and keep it somewhere safe - the Pi server will need this password.
5. Run `npm install` to install the required dependencies for the script. Then, execute `node hash-server-password.js` in a terminal (being in the `./target_server` directory) to create a server password. You need to remember this password, because it allows you to remotely suspend or reboot your machine.
6. Install pm2, a process manager for Node.js: `npm install --global pm2`
7. If you're on Windows, install the pm2 windows service: `npm install pm2-windows-startup --global`
8. Configure automatic startup for the script: `pm2 startup` (linux) or `pm2-startup install` (windows)
9. For remote suspending to work properly, hibernation should be disabled with `powercfg -hibernate off`.
10. Start the script with the following command: `pm2 start index.js`
11. Enable automatic startup for the script: `pm2 save`

### Installation of the `pi` webapp on the Raspberry Pi

This guide assumes that you already have an operating system installed on the Pi with internet connectivity.

1. Install Node.js and npm:

```bash
# Install build-essential, needed for nvm
sudo apt install build-essential -y

# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# Install Node.js using nvm. Be patient; this will take a while on SBCs with weak processors.
nvm install --lts
```

2. Clone this repository and navigate to `./server`.
3. Copy `example.env` to `.env`: `cp example.env .env`
4. Edit `.env` to match your system:

- `COMPANION_SECRET` is the secret that is used to safely communicate with your computer. **This value MUST be the same as what you've set on your computer!** If your computer's `COMPANION_SECRET` is `password123`, then the Pi's `COMPANION_SECRET` must also be `password123`.
- `MAC_ADDRESS` is the MAC address of your computer's network interface. This will be used for Wake on LAN.
- `COMPANION_URL` is the URL for the companion server, i.e. what you've just configured on your PC. The companion server runs on port 4617, so use the following format to get the URL: `http://<COMPUTER_IP>:4617`. For security reasons, you should use the IP address from your VPN such as ZeroTier or Tailscale here.
- `URL_TO_PING` is the web server that OWoL can automatically monitor for you. This is useful if you're running something like Nextcloud or Plex on your machine. Set this to the value of `COMPANION_URL` if you don't have such a server.

3. Install pm2, a process manager that will automatically start the script when the Pi is rebooted (if it loses power, for example): `sudo npm install --global pm2`
4. Install the required dependencies for the script: `npm install`.
5. Start the script with the following command: `pm2 start index.js`
6. Configure automatic startup for the script: `pm2 startup`
7. Enable automatic startup for the script: `pm2 save`
8. Go to `[PI_IP]:3000` to access the web interface.

### HTTPS

HTTPS is optional if you are using Tailscale or ZeroTier, as both of which encrypt your traffic already. In order to use HTTPS, you need to get the HTTPS certificate and private key for your domain (see [here](https://tailscale.com/kb/1153/enabling-https/) for Tailscale) and add the paths for these files in `.env` (regardless of whether you're adding HTTPS to the Pi or target server).

## Uninstall

1. Use `pm2 unstartup` on Linux and macOS to disable automatic startup for the script. For Windows, use `pm2-startup uninstall`.
2. Reboot your machine.
3. Delete the script files.
4. Optionally, delete pm2: `npm remove pm2 -g`

## Security

Several important security improvements have been introduced since the first iteration of this project. Most notably, it is now possible to encrypt all traffic between the you, the Pi and the target server using HTTPS, which adds an extra layer of protection on top of a VPN. A **server password** is also now required, that contols whether somebody can reboot or suspend your server. This password is *not known* in cleartext by the Pi or server, because it's hashed using Argon2 by default, ensuring that nobody except you can control your machine - even if the `.env` file is compromised.

Thanks to the way this project has been architectured, little damage can be done if somebody gets your companion secret or server password. Because the API endpoints never execute user input, an attacker is only able to reboot, sleep or wake your machine and get basic information about it, such as CPU, memory and motherboard information.

Nonetheless, usage of a VPN such as Tailscale or ZeroTier is highly recommended. These services have strict access control and encrypt the traffic between you, your Raspberry Pi, and your computer on top of TLS. You should only use the IP addresses or domains provided by ZeroTier/Tailscale in configuration files.

## TODO

- Cleanup code
- Test Linux support
- Improve website: show detailed error information, including failed HTTP requests.
