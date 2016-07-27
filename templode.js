#!/usr/bin/env node

/* 
	Author: Josh Spivey
	Version: 0.0.1
	usage: node templode.js
*/

var fs = require('graceful-fs'),
    path = require('path'),
    rjs = require('requirejs'),
    async = require('async'),
    mkdirp = require("mkdirp"),
    getDirName = require("path").dirname,
    Walker = require("walker"),
    _ = require("underscore"),
    events = require('events'),
    program = require('commander'),
    util = require('util');

program.command('run')
    .option('-t, --token <path>', 'Token Value')
    .description('-- place files in correct location --')
   .parse(process.argv);

//Only tokenize these extensions
var extensionsArr = [
    "js",
    "json",
    "cshtml",
    "html",
    "xml",
    "sh",
    "md",
    "css",
    "scss",
    "rst",
    "gitignore",
    "example",
    "txt",
    "cs",
    "csproj",
    "sln",
    "config",
    "trx",
    "asax",
    ""
];

//you can have multiple tokens just add another object to the array
var tokenArr = [{
    token: "TS001",
    replaceWith: program.commands[0].token
}];

var projectTree = [],
    fileContents = [],
    filePaths = [],
    index = 0,
    output = tokenArr[0].replaceWith + "/", //folder to output to
    folderTemplate = 'site-template', //This is the template
    outputIsPath = output.charAt(output.length - 1) === '/';

var FsPool = module.exports = function(dir) {
    events.EventEmitter.call(this);
    this.starttime = (new Date()).getTime();
    this.dir = dir;
    this.files = [];
    this.active = [];
    this.threads = 1;
    this.processedFiles = 0;
    this.on('run', this.runQuota.bind(this));
};
// So will act like an event emitter
util.inherits(FsPool, events.EventEmitter);

FsPool.prototype.runQuota = function() {
    if (this.files.length === 0 && this.active.length === 0) {
        return this.emit('done');
    }
    if (this.active.length < this.threads) {
        var name = this.files.shift();

        this.active.push(name.file);
        //console.log("Dir: ",this.dir);
        var fileName = path.join(this.dir, name.file);
        var self = this;
        fs.stat(fileName, function(err, stats) {
            if (err) {
                throw err;
            }
            if (stats.isFile()) {
                fs.readFile(fileName, function(err, data) {
                    if (err) {
                        throw err;
                    }
                    self.active.splice(self.active.indexOf(name.file), 1);
                    self.emit('file', name.file, data, name.parseIt);
                    self.emit('run');
                });
            } else {
                self.active.splice(self.active.indexOf(name.file), 1);
                self.emit('dir', name.file);
                self.emit('run');
            }
        });
    }
    return this;
};

FsPool.prototype.init = function() {
    var dir = this.dir;
    var self = this;

    self.files = projectTree;
    self.emit('run');

    return this;
};

FsPool.prototype.findAndReplaceTokens = function(fileContent, fileName, parseIt) {

    if (fileContent) {
        _.each(tokenArr, function(token) {
            if (token.token !== undefined) {

                // replace all occurances of the token
                var pattern = token.token;
                var re = new RegExp(pattern, "gm");
                if (parseIt) {
                    fileContent = String(fileContent).replace(re, String(token.replaceWith));
                    fileNameNew = fileName.replace(re, String(token.replaceWith));
                } else {
                    fileNameNew = fileName.replace(re, String(token.replaceWith));
                }
            } else {
                //console.log("Replacement failed for token '" + token.token + "'.");
            }
        });
    }

    this.writeOutput(fileContent, fileNameNew, fileName, parseIt);

};

FsPool.prototype.writeOutput = function(fileContent, fileNameNew, fileName, parseIt) {
    var self = this;

    var inputPath = fileName.split("/");
    inputPath = inputPath[inputPath.length - 1];
    var cleanPath = new RegExp("test-standards", "gm");
    var curPath = outputIsPath ? output + fileNameNew.replace(cleanPath, "") : output.replace(cleanPath, "");

    mkdirp(getDirName(curPath), function(err) {

        if (parseIt) {
            fs.writeFile(curPath, fileContent, 'utf8', function(err) {
                if (self.processedFiles === fileContents.length - 1) {
                    self.processedFiles = 0;
                    fileContents = [];
                }
            });
        } else {
            self.copyFile(path.resolve(fileName), path.resolve(curPath), function(err) {
                if (err) {
                    console.log("err: ", err);
                }
            });
        }
    });
    console.log("Processed: ",path.resolve(curPath));
};

FsPool.prototype.copyFile = function(source, target, cb) {
    var cbCalled = false;

    var rd = fs.createReadStream(source);
    rd.on("error", function(err) {
        done(err);
    });
    var wr = fs.createWriteStream(target);
    wr.on("error", function(err) {
        done(err);
    });
    wr.on("close", function(ex) {
        done();
    });
    rd.pipe(wr);

    function done(err) {
        if (!cbCalled) {
            cb(err);
            cbCalled = true;
        }
    }
};

var fsPool = new FsPool(__dirname);
fsPool.on('file', function(fileName, fileData, parseIt) {
    //console.log('file name: ' + fileName);
    this.findAndReplaceTokens(fileData, fileName, parseIt);
    index++;
});
fsPool.on('dir', function(dirName) {
    //console.log('dir name: ' + dirName)
});
fsPool.on('done', function() {
    var endtime = (new Date()).getTime();
    console.log('You temploded in - ' + ((endtime - this.starttime) / 1000) + ' seconds');
});

var extAloud = function(tmpExt) {
    for (var i = 0; i < extensionsArr.length; i++) {
        if (extensionsArr[i] === tmpExt) return true;
    }
    return false;
};

Walker(folderTemplate)
    .on('file', function(file, stat) {
        var ext = file.substr(file.lastIndexOf('.') + 1);
        //console.log('Got file: ' + file, " | ", extAloud(ext));
        projectTree.push({
            "file": file,
            "parseIt": extAloud(ext)
        });
    })
    .on('end', function() {
        console.log('All files traversed.');
        fsPool.init();
    });
