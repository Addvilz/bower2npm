'use strict';

/**
 * The code is garbage. But it works.
 * That's all I care about for now...
 */

const bower = require('bower');
const fs = require('fs');
const request = require('request');
const url = require("url");

const bowerDataStr = fs.readFileSync('bower.json');
const bowerData = JSON.parse(bowerDataStr);

let deps = {};
let devDeps = {};

if (typeof bowerData.dependencies !== 'undefined') {
    deps = bowerData.dependencies;
}

if (typeof bowerData.devDependencies !== 'undefined') {
    devDeps = bowerData.devDependencies;
}

const total = Object.keys(deps).length + Object.keys(devDeps).length

const resolvedDeps = [];
const resolvedDevDeps = [];

let i = 0;

function printDeps(t, list) {
    if (!list.length) {
        return;
    }
    list.sort(function (a, b) {
        return (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0);
    });
    process.stdout.write('\n' + t + '\n\n');
    let buf = '';
    for (const entry of list) {
        buf += `\t"${entry.name}": "${entry.version}",\n`
    }
    process.stdout.write(buf + '\n')
}

function done(dependency, pckg, error) {
    i++;
    if (!pckg) {
        if (true === (typeof error === 'string')) {
            process.stderr.write(error + '\n');
        } else {
            process.stderr.write(
                `Could not migrate dependency: ${dependency} \n` +
                `[${error.response.statusCode}] ${error.url} ${error.body}`
            );
        }

    } else {
        switch (dependency.type) {
            case 'dep':
                resolvedDeps.push(pckg);
                break;
            case 'dev':
                resolvedDevDeps.push(pckg);
                break;

        }
    }
    if (i == total) {
        printDeps('dependencies:', resolvedDeps);
        printDeps('devDependencies', resolvedDevDeps);
    }

}

function handleGitRemote(error, response, body, dependency, version, packageUrl) {
    if (!error && response.statusCode == 200) {
        const packageJson = JSON.parse(body);
        done(
            dependency, {
                name: packageJson.name,
                version: version
            }
        );
    } else {
        done(
            dependency,
            null,
            {
                error: error,
                response: response,
                body: body,
                url: packageUrl
            }
        );
    }
}

function handleLookupRequest(res, dependency, version) {
    if (res && typeof res.url !== 'undefined') {
        const repo = url.parse(res.url);

        const packageUrl =
                'https://raw.github.com' +
                repo.path.substr(0, repo.path.length - 4) +
                '/master/package.json'
            ;

        if ('github.com' !== repo.host) {
            done(dependency, null, `Unknown repo host: ${repo.host}`);
            return;
        }

        request.get(packageUrl, (error, response, body) => {
            handleGitRemote(
                error,
                response,
                body,
                dependency,
                version,
                packageUrl
            )
        });

    } else {
        done(dependency);
    }
}

function lookup(dependency) {
    bower
        .commands
        .lookup(dependency.name)
        .on('end', (res) => {
            handleLookupRequest(
                res,
                dependency,
                'dep' === dependency.type ?
                    deps[dependency.name] : devDeps[dependency.name]
            )
        })
    ;
}

for (const dependency of Object.keys(deps)) {
    lookup({
        name: dependency,
        type: 'dep'
    });
}

for (const dependency of Object.keys(devDeps)) {
    lookup({
        name: dependency,
        type: 'dev'
    });
}
