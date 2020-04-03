# node-red-contrib-googlehome

A set of Node-RED nodes to allow Node-RED to act as a endpoint for 
Google Home Smart Home Action

## Prerequisite

To support the new Local Control API we now need a mdns server to allow the Google Assistant device to be able find the local Node-RED install.

**This feature is not currently enabled as Local Control is still in beta with Google, but when it goes on general release it will just work**

On Raspbian you need to make sure this the following package is installed.

`sudo apt-get install libavahi-compat-libdnssd-dev`

## Install

Use the palette manager to install the node directly from with in Node-RED

or

In the Node-RED userDir (usually ~/.node-red) run the following command:

`npm install node-red-contrib-googlehome`



## Configuration

You will need an account [here](https://googlehome.hardill.me.uk). Once you have an account you can define a number of devices. You can then configure a node to representthat device in a Node-RED flow.

The full documentation can be found [here](https://googlehome.hardill.me.uk/docs). Please make sure you read the details at the top about needing to create an account and to join the Google Group to enable access to the Google Action in the Google Home app.