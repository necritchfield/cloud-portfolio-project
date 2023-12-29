const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const ds = require('./datastore');

const datastore = ds.datastore;

const { auth } = require('express-openid-connect');
const { requiresAuth } = require('express-openid-connect');

const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const CLIENT_ID = 'Ghs4JlhSUyy7h7Wm7h3Sdljkx3pHalep';
const CLIENT_SECRET = 'xxx';
const DOMAIN = 'dev-xgso6y32tqja1nvc.us.auth0.com';

const BOAT = "Boat";
const LOAD = "Load";

router.use(bodyParser.json());

const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
    }),

    // Validate the audience and the issuer.
    issuer: `https://${DOMAIN}/`,
    algorithms: ['RS256']
  });

/* ------------- Begin Boat Model Functions ------------- */
function post_boat(name, type, length, owner){
    var key = datastore.key(BOAT);
	const new_boat = {"name": name, "type": type, "length": length, "owner": owner, "loads": []};
	return datastore.save({"key":key, "data":new_boat}).then(() => {return key});
}

function get_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. Don't try to add the id attribute
            return entity;
        } else {
            // Use Array.map to call the function fromDatastore. This function
            // adds id attribute to every element in the array entity
            return entity.map(ds.fromDatastore);
        }
    });
}

function get_load(id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. Don't try to add the id attribute
            return entity;
        } else {
            // Use Array.map to call the function fromDatastore. This function
            // adds id attribute to every element in the array entity
            return entity.map(ds.fromDatastore);
        }
    });
}

function get_boats(req){
    var q = datastore.createQuery(BOAT).filter('owner', '=', req.auth.sub).limit(5);
    const results = {};
    if(Object.keys(req.query).includes("cursor")){
        q = q.start(req.query.cursor);
    }
	return datastore.runQuery(q).then( (entities) => {
            results.items = entities[0].map(ds.fromDatastore);
            if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
            }
            return results;
		});
}

function get_boats_count(req) {
    let q = datastore.createQuery(BOAT).filter('owner', '=', req.auth.sub);
    return datastore.runQuery(q).then( (entities) => {
        let count = entities[0].length;
        return count;
    })
}

function get_boat_loads(req, id){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    return datastore.get(key)
    .then( (boats) => {
        const boat = boats[0];
        const load_keys = boat.loads.map( (l_id) => {
            return datastore.key([LOAD, parseInt(l_id.id,10)]);
        });
        return datastore.get(load_keys);
    })
    .then((loads) => {
        loads = loads[0].map(ds.fromDatastore);
        return loads.map(ds.fromDatastore);
    });
}

function put_boat(id, name, type, length, owner){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    const boat = {"name": name, "type": type, "length": length, "owner": owner};
    return datastore.save({"key":key, "data":boat});
}

function delete_boat(id){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    datastore.get(key).then((entity) => {
        let boat = entity.map(ds.fromDatastore);
        let loads = boat[0].loads;
        for (let i = 0; i < loads.length; i++) {
            remove_carrier_from_load(loads[i].id, id);
        }
    })
    return datastore.delete(key);
}

function put_carrier_to_load(lid, bid, carrier, req) {
    const key = datastore.key([LOAD, parseInt(lid,10)]);
    datastore.get(key).then((entity) => {
        let existing_load = entity.map(ds.fromDatastore);
        const load = {"volume": existing_load[0].volume, "item": existing_load[0].item, "creation_date": existing_load[0].creation_date, "carrier": {"id": bid, "name": carrier.name, "self": generate_self(req.protocol, req.get("host"), "/boats", bid)}};
        return datastore.save({"key":key, "data":load})
    })
}

function remove_carrier_from_load(lid, bid) {
    const key = datastore.key([LOAD, parseInt(lid,10)]);
    datastore.get(key).then((entity) => {
        let existing_load = entity.map(ds.fromDatastore);
        const load = {"volume": existing_load[0].volume, "item": existing_load[0].item, "creation_date": existing_load[0].creation_date, "carrier": null};
        return datastore.save({"key":key, "data":load})
    })
}

function put_load(bid, lid, req){
    const b_key = datastore.key([BOAT, parseInt(bid,10)]);
    return datastore.get(b_key)
    .then( (boat) => {
        if( typeof(boat[0].loads) === 'undefined'){
            boat[0].loads = [];
        }
        const load_obj = {id: lid, self: generate_self(req.protocol, req.get("host"), "/loads", lid)}
        boat[0].loads.push(load_obj);
        put_carrier_to_load(lid, bid, boat[0], req);
        return datastore.save({"key":b_key, "data":boat[0]});
    });
}

function delete_load_from_boat(bid, lid, req) {
    const b_key = datastore.key([BOAT, parseInt(bid,10)]);
    return datastore.get(b_key)
    .then( (boat) => {
        let loads = boat[0].loads;
        for (let i = loads.length - 1; i >= 0; --i) {
            if (loads[i].id == lid) {
                loads.splice(i,1);
            }
        }
        boat[0].loads = loads;
        remove_carrier_from_load(lid, bid);
        return datastore.save({"key":b_key, "data":boat[0]});
    });
}

function generate_response(key, req) {
    let response_string = '';
    if( typeof(key.loads) === 'undefined'){
        response_string = '{ "id": ' + key.id + ', "name": "' + key.name + '", "type": "' + key.type + '", "length": ' + key.length + ', "owner": "' + key.owner + '", "loads": [], "self": "' + generate_self(req.protocl, req.get("host"), req.baseUrl, key.id) + '" }';
    }
    else {
        response_string = '{ "id": ' + key.id + ', "name": "' + key.name + '", "type": "' + key.type + '", "length": ' + key.length + ', "owner": "' + key.owner + '", "loads": ' + JSON.stringify(key.loads) + ', "self": "' + generate_self(req.protocol, req.get("host"), req.baseUrl, key.id) + '" }';
    }
    return response_string;
}

function generate_self(protocol, host, baseUrl, id) {
    let self = protocol + "://" + host + baseUrl + "/" + id;
    return self;
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get('/', checkJwt, function(req, res){
    if(req.headers.accept != 'application/json'){
        res.status(406).send('{ "Error": "Accept type not supported" }');
    }
    const boats = get_boats(req)
	.then( (boats) => {
        const count = get_boats_count(req).then( (count) => {
            res.status(200).send('{ "boats":' + JSON.stringify(boats["items"]) + ', "collection_count": ' + count + ', "next": ' + JSON.stringify(boats["next"]) + '} ');
        })
    });
});

router.get('/:id', checkJwt, function (req, res) {
    if(req.headers.accept != 'application/json'){
        res.status(406).send('{ "Error": "Accept type not supported" }');
    }
    get_boat(req.params.id)
        .then(boat => {
            if (boat[0] === undefined || boat[0] === null) {
                // The 0th element is undefined. This means there is no boat with this id
                res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
            }
            else if (req.auth.sub != boat[0].owner) {
                res.status(401).json({ 'Error': 'Access Denied' });
            }
            else {
                // Return the 0th element which is the boat with this id
                res.status(200).send(generate_response(boat[0], req));
            }
        });
});

router.post('/', checkJwt, function(req, res){
    if (req.body.name == null || req.body.type == null || req.body.length == null) {
        res.status(400).send('{ "Error": "The request object is missing at least one of the required attributes" }');
    }
    if(req.headers.accept != 'application/json'){
        res.status(406).send('{ "Error": "Accept type not supported" }');
    }
    else {
        post_boat(req.body.name, req.body.type, req.body.length, req.auth.sub)
        .then( key => {res.status(201).send('{ "id": ' + key.id + ', "name": "' + req.body.name + '", "type": "' + req.body.type + '", "length": ' + req.body.length + ', "owner": "' + req.auth.sub + '", "loads": [], "self": "' + generate_self(req.protocol, req.get("host"), req.baseUrl, key.id) + '" }'); });
    }
});

router.patch('/:id', checkJwt, function(req, res){
    if(req.get('content-type') !== 'application/json'){
        res.status(415).send('{ "Error": "Server only accepts application/json data." }')
    };
    if(req.headers.accept != 'application/json'){
        res.status(406).send('{ "Error": "Accept type not supported" }');
    };
    get_boat(req.params.id).then((boat) => {
        if(boat[0] === null || boat[0] === undefined) {
            res.status(404).send('{ "Error": "No boat with this boat_id exists" }');
        }
        else if (req.auth.sub != boat[0].owner) {
            res.status(401).json({ 'Error': 'Access Denied' });
        }

        // if an attribute is not in request body, set to current value
        let name = '';
        let type = '';
        let length = 0;
        if(req.body.name) {
            name = req.body.name;
        }
        else {
            name = boat[0].name;
        }
        if(req.body.type) {
            type = req.body.type;
        }
        else {
            type = boat[0].type;
        }
        if(req.body.length) {
            length = req.body.length;
        }
        else {
            length = boat[0].length;
        }
        put_boat(req.params.id, name, type, length, req.auth.sub).then(res.status(200).send('{ "id": ' + req.params.id + ', "name": "' + name + '", "type": "' + type + '", "length": ' + length + ', "owner": ' + req.auth.sub + ', "self": "' + generate_self(req.protocol, req.get("host"), req.baseUrl, req.params.id) + '" }'));
    })
});

router.put('/:id', checkJwt, function(req, res){
    if(req.headers.accept != 'application/json'){
        res.status(406).send('{ "Error": "Accept type not supported" }');
    }
    get_boat(req.params.id).then((boat) => {
        if(boat[0] === null || boat[0] === undefined) {
            res.status(404).send('{ "Error": "No boat with this boat_id exists" }');
        }
        else if (req.body.name == null || req.body.type == null || req.body.length == null) {
            res.status(400).send('{ "Error": "The request object is missing at least one of the required attributes" }');
        }
        else if (req.auth.sub != boat[0].owner) {
            res.status(401).json({ 'Error': 'Access Denied' });
        }
        else {
            put_boat(req.params.id, req.body.name, req.body.type, req.body.length, req.auth.sub)
            .then(res.status(200).send('{ "id": ' + req.params.id + ', "name": "' + req.body.name + '", "type": "' + req.body.type + '", "length": ' + req.body.length + ', "owner": ' + req.auth.sub + ', "self": "' + generate_self(req.protocol, req.get("host"), req.baseUrl, req.params.id) + '" }'));
        }
    })
});

router.put('/:bid/loads/:lid', checkJwt, function(req, res){
    get_boat(req.params.bid).then(boat => {
        if (boat[0] === null || boat[0] === undefined) {
            res.status(404).send('{ "Error": "The specified boat and/or load does not exist" }');
        }
        else if (req.auth.sub != boat[0].owner) {
            res.status(401).json({ 'Error': 'Access Denied' });
        }
        else {
            get_load(req.params.lid).then(load => {
                if (load[0] == null || load[0] == undefined) {
                    res.status(404).send('{ "Error": "The specified boat and/or load does not exist" }');
                }
                else if (load[0].carrier != null) {
                    res.status(403).send('{ "Error": "The load is already loaded on another boat" }');
                }
                else {
                    put_load(req.params.bid, req.params.lid, req)
                    .then(res.status(204).end());
                }
            })
        }
    })
});

router.delete('/:id', checkJwt, function(req, res){
    get_boat(req.params.id).then(boat => {
        if (boat[0] === null || boat[0] === undefined) {
            res.status(404).send('{ "Error": "No boat with this boat_id exists" }');
        }
        else if (req.auth.sub != boat[0].owner) {
            res.status(401).json({ 'Error': 'Access Denied' });
        }
        else {
            delete_boat(req.params.id).then(res.status(204).end());
        }
    })
});

router.delete('/:bid/loads/:lid', checkJwt, function(req, res){
    get_boat(req.params.bid).then(boat => {
        if (boat[0] === null || boat[0] === undefined) {
            res.status(404).send('{ "Error": "No boat with this boat_id is loaded with the load with this load_id" }');
        }
        else if (req.auth.sub != boat[0].owner) {
            res.status(401).json({ 'Error': 'Access Denied' });
        }
        else {
            let found = false;
            for (let i = 0; i < boat[0].loads.length; i++) {
                if (boat[0].loads[i].id == req.params.lid) {
                    found = true;
                }
            }
            if (found == false) {
                res.status(404).send('{ "Error": "No boat with this boat_id is loaded with the load with this load_id" }');
            }
            else {
                delete_load_from_boat(req.params.bid, req.params.lid, req).then(res.status(204).end())
            }
        }
    })
});

// 405 status codes
router.put('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});

router.patch('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});

router.delete('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});


/* ------------- End Controller Functions ------------- */

module.exports = router;
