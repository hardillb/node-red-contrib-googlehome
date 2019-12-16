/**
 * Copyright 2017-2019 Ben Hardill
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

var brokerHost = process.env.GOOGLEHOME_BROKER || 'googlehome.hardill.me.uk';
var devicesURL = process.env.GOOGLEHOME_URL || 'https://googlehome.hardill.me.uk/user/api/devices';

module.exports = function(RED) {

  "use strict";
  const fs = require('fs');
  const mqtt = require('mqtt');
  const path = require('path');
  const request = require('request');

  var devices = {};

  var caPath = path.join(__dirname, "ca-chain.pem");

  function googleHomeConf(n) {
    RED.nodes.createNode(this,n);
    this.username = n.username;
    this.password = this.credentials.password;

    this.users = {};

    var node = this;

    var options = {
      username: node.username,
      password: node.password,
      clientId: node.username,
      reconnectPeriod: 5000,
      ca: [fs.readFileSync(caPath)],
      servers:[
        {
          protocol: 'mqtts',
          host: brokerHost,
          port: 8883
        },
        {
          protocol: 'mqtt',
          host: brokerHost,
          port: 1883
        }
      ]
    };

    getDevices(this.username, this.password, node.id);

    this.connect = function() {
      node.client = mqtt.connect(options);
      node.client.setMaxListeners(0);

      node.client.on('connect', function() {
          node.setStatus({text:'connected', shape:'dot', fill:'green'});
          node.client.removeAllListeners('message');
          node.client.subscribe("command/" + node.username + "/#");
          node.client.on('message', function(topic, message) {
            //tricky bit
            var msg = JSON.parse(message.toString());
            var devId = msg.id;
            for (var id in node.users) {
              if (node.users.hasOwnProperty(id)){
                if (node.users[id].device === devId) {
                  node.users[id].command(msg);
                }
              }
            }
          });
        }
      );

      node.client.on('offline',function() {
        node.setStatus({text: 'disconnected', shape: 'dot', fill:'red'});
      });

      node.client.on('reconnect', function() {
        node.setStatus({text: 'reconnecting', shape: 'ring', fill:'red'});
      });

      node.client.on('error', function (err) {
        //console.log(err);
        node.setStatus({text: 'disconnected', shape: 'dot', fill:'red'});
        node.error(err);
      });
    };

    this.setStatus = function(status) {
      for( var id in node.users) {
        if (node.users.hasOwnProperty(id)) {
          node.users[id].status(status);
        }
      }
    }

    this.register = function(deviceNode) {
      node.users[deviceNode.id] = deviceNode;
      if (Object.keys(node.users).length === 1) {
        node.connect();
      } else {
        node.setStatus({text:'connected', shape:'dot', fill:'green'});
      }
    }

    this.unregister = function(deviceNode, done) {
      delete node.users[deviceNode.id];

      if (Object.keys(node.users).length === 0) {
        if (node.client && node.client.connected) {
          node.client.end(done);
        } else {
          node.client.end();
          done();
        }
      }

      done();
    }

    this.acknowledge = function(msg) {
      var topic = "response/" + node.username;
      node.client.publish(topic, JSON.stringify(msg));
    }

    this.reportState = function(msg) {
      var topic = "status/" + node.username;
      node.client.publish(topic, JSON.stringify(msg));
    }

    this.on('close', function(){
      if (node.client && node.client.connected) {
        node.client.end();
      }
    });
  }

  RED.nodes.registerType("google-home-conf",googleHomeConf,{
    credentials: {
      password: {type:"password"}
    }
  });

  function googleHome(n) {
    RED.nodes.createNode(this,n);
    this.conf = RED.nodes.getNode(n.conf);
    this.confId = n.conf;
    this.acknowledge = n.acknowledge;
    this.topic = n.topic;
    this.device = n.device;
    this.name = n.name;

    var node = this;

    node.command = function(msg) {
      var m = {
        topic: node.topic || "",
        name: node.name,
        deviceId: msg.id,
        _requestId: msg.requestId,
        _raw: msg,
        _confId: node.confId,
        payload: msg.execution
      }
      node.send(m);
      if (node.acknowledge) {
        msg.status = true;
        node.conf.acknowledge(msg);
      }
    }

    node.conf.register(node);

    node.on('close', function(done){
      node.conf.unregister(node, done);
    });
  }

  RED.nodes.registerType("google-home", googleHome);

  function googleHomeResponse(n) {
    RED.nodes.createNode(this,n);
    this.conf = RED.nodes.getNode(n.conf);
    this.confId = n.conf;
    this.deviceId = n.device;

    var node = this;

    node.on('input', function(msg){
      //console.log(msg)
      if (msg._confId) {
        if (msg._confId == node.confId) {
          if (msg._requestId) {
            console.log("replying to a command")
            var resp = {
              requestId: msg._requestId,
              id: msg.deviceId,
              execution: msg.payload
            }
            node.conf.acknowledge(resp);
          } else {
            // no request id so something wrong
            node.error("No _confId but no _requestId",msg);
          }
        } else {
          node.error("Input message confId does not match configuration", msg);
        }
      } else {
        // no conf id in message so must be a report
        console.log("status change");
        var resp = {
          id: node.deviceId,
          execution: msg.payload
        }
        node.conf.reportState(resp);
      }

    })

    node.conf.register(node);

    node.on('close', function(done){
      node.conf.unregister(node, done);
    });
  }

  RED.nodes.registerType("google-home-response", googleHomeResponse);

  function getDevices(username, password, id) {
    if (username && password) {
      request.get({
        url: devicesURL,
        auth: {
          username: username,
          password: password
        }
      }, function(err,res,body) {
        if (!err && res.statusCode == 200) {
          var devs = JSON.parse(body);
          devices[id] = devs
        } else {
          //console.("err: " + err);
          RED.log.log("Problem looking up " + username + "'s devices");
        }
      });
    }
  }

  RED.httpAdmin.post('/google-home/new-account',function(req,res){
    var username = req.body.user;
    var password = req.body.pass;
    var id = req.body.id;
    getDevices(username,password,id);
    res.status(200).send();
  });

  RED.httpAdmin.post('/google-home/refresh/:id', function(req,res){
    var id = req.params.id;
    var conf = RED.nodes.getNode(id);
    if (conf) {
      var username = conf.username;
      var password = conf.credentials.password;
      getDevices(username,password,id);
      res.status(200).send();
    } else {
      //not deployed yet
      console.log("Can't refresh until deployed");
      res.status(404).send();
    }
  });

  RED.httpAdmin.get('/google-home/devices/:id', function(req,res){
    if (devices[req.params.id]) {
      res.send(devices[req.params.id]);
    } else {
      res.status(404).send();
    }
  });
}