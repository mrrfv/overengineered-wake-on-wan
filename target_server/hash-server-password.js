import readline from 'readline';
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
import argon2 from 'argon2';
import fs from 'fs';

// function to replace all occurences of a string with another string
function replaceAll(str, find, replace) {
    return str.replace(new RegExp(find, 'g'), replace);
}

rl.question("Enter your server password: ", async function(cleartext_pw) {
    // hash the password
    const hash = await argon2.hash(cleartext_pw, { timeCost: 8, type: argon2.argon2id })
    console.log("Put this in your .env file:")
    console.log(`SERVER_PASSWORD=${hash}`)
    rl.question("Write password to .env file automatically? Type 'y' for YES or 'n' for NO. ", async function(yesno) {
        if (yesno.toLowerCase() === "y") {
            if (!fs.existsSync('.env')) return console.error(".env file does not exist, cannot continue")
            // read .env file
            let env = fs.readFileSync('.env', 'utf8');
            // comment out the old server password
            env = replaceAll(env, "\nSERVER_PASSWORD=", "\n#SERVER_PASSWORD=");
            env += // the lines below will be added to the file
`
# Automatically added by hash-server-password.js at ${new Date().toString()}
SERVER_PASSWORD=${hash}
`
            // save edits
            fs.writeFileSync('.env', env, 'utf8');
            console.log("Done")
            return rl.close();
        }
    });
});

rl.on("close", function() {
    process.exit(0);
});