const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

const ds = require('./datastore');

const datastore = ds.datastore;

const LOAD = "Load";
const BOAT = "Boat";

router.use(bodyParser.json());


/* ------------- Begin Load Model Functions ------------- */
function post_load(volume, item, creation_date){
    var key = datastore.key(LOAD);
	const new_load = {"volume": volume, "item": item, "creation_date": creation_date};
	return datastore.save({"key":key, "data":new_load}).then(() => {return key});
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

function get_loads(req){
    var q = datastore.createQuery(LOAD).limit(5);
    const results = {};
    var prev;
    if(Object.keys(req.query).includes("cursor")){
        prev = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + req.query.cursor;
        q = q.start(req.query.cursor);
    }
	return datastore.runQuery(q).then( (entities) => {
            results.items = entities[0].map(ds.fromDatastore);
            if(typeof prev !== 'undefined'){
                results.previous = prev;
            }
            if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
            }
			return results;
		});
}

function get_loads_count(req) {
    let q = datastore.createQuery(LOAD);
    return datastore.runQuery(q).then( (entities) => {
        let count = entities[0].length;
        return count;
    })
}

function put_load(id, volume, item, creation_date){
    const key = datastore.key([LOAD, parseInt(id,10)]);
    const load = {"volume": volume, "item": item, "creation_date": creation_date};
    return datastore.save({"key":key, "data":load});
}

function delete_load(id){
    const key = datastore.key([LOAD, parseInt(id,10)]);
    datastore.get(key).then((entity) => {
        let load = entity.map(ds.fromDatastore);
        let carrier = load[0].carrier;
        remove_load_from_boat(carrier.id, id);
    })
    return datastore.delete(key);
}

function remove_load_from_boat(cid, lid) {
    const key = datastore.key([BOAT, parseInt(cid,10)]);
    datastore.get(key).then((boat) => {
        let loads = boat[0].loads;
        for (let i = loads.length - 1; i >= 0; --i) {
            if (loads[i].id == lid) {
                loads.splice(i,1);
            }
        }
        boat[0].loads = loads;
        return datastore.save({"key":key, "data":boat[0]});
    });
}

function generate_response(id, volume, item, creation_date, carrier, req) {
    let response_string = '';
    if (carrier == null) {
        response_string = '{ "id": ' + id + ', "volume": ' + volume + ', "item": "' + item + '", "creation_date": "' + creation_date + '", "carrier": null, "self": "' + generate_self(req, id) + '" }';
    }
    else {
        response_string = '{ "id": ' + id + ', "volume": ' + volume + ', "item": "' + item + '", "creation_date": "' + creation_date + '", "carrier":' + JSON.stringify(carrier) + ', "self": "' + generate_self(req, id) + '" }';
    }
    
    return response_string;
}

function generate_self(req, id) {
    let self = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + id;
    return self;
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get('/', function(req, res){
    if(req.headers.accept != 'application/json'){
        res.status(406).send('{ "Error": "Accept type not supported" }');
    }
    const loads = get_loads(req)
	.then( (loads) => {
        const count = get_loads_count(req).then( (count) => {
            res.status(200).send('{ "loads":' + JSON.stringify(loads["items"]) + ', "collection_count": ' + count + ', "next": ' + JSON.stringify(loads["next"]) + '}');
        });
    });
});

router.get('/:id', function (req, res) {
    if(req.headers.accept != 'application/json'){
        res.status(406).send('{ "Error": "Accept type not supported" }');
    }
    get_load(req.params.id)
        .then(load => {
            if (load[0] === undefined || load[0] === null) {
                // The 0th element is undefined. This means there is no load with this id
                res.status(404).json({ 'Error': 'No load with this load_id exists' });
            } else {
                // Return the 0th element which is the load with this id
                res.status(200).send(generate_response(load[0].id, load[0].volume, load[0].item, load[0].creation_date, load[0].carrier, req));
            }
        });
});

router.post('/', function(req, res){
    if(req.headers.accept != 'application/json'){
        res.status(406).send('{ "Error": "Accept type not supported" }');
    }
    if (req.body.volume == null || req.body.item == null || req.body.creation_date == null) {
        res.status(400).send('{ "Error": "The request object is missing at least one of the required attributes" }');
    }
    else {
        post_load(req.body.volume, req.body.item, req.body.creation_date)
        .then( key => {res.status(201).send(generate_response(key.id, req.body.volume, req.body.item, req.body.creation_date, null, req))} );
    }
});

router.put('/:id', function(req, res){
    if(req.headers.accept != 'application/json'){
        res.status(406).send('{ "Error": "Accept type not supported" }');
    }
    if (req.body.volume == null || req.body.item == null || req.body.creation_date == null) {
        res.status(400).send('{ "Error": "The request object is missing at least one of the required attributes" }');
    }
    else {
        get_load(req.params.id).then((load) => {
            if(load[0] === null || load[0] === undefined) {
                res.status(404).send('{ "Error": "No load with this load_id exists" }');
            }
            put_load(req.params.id, req.body.volume, req.body.item, req.body.creation_date)
            .then(res.status(200).send(generate_response(req.params.id, req.body.volume, req.body.item, req.body.creation_date, load[0].carrier, req)));
        })
    }
});

router.patch('/:id', function(req, res){
    if(req.headers.accept != 'application/json'){
        res.status(406).send('{ "Error": "Accept type not supported" }');
    }
    if(req.get('content-type') !== 'application/json'){
        res.status(415).send('{ "Error": "Server only accepts application/json data." }')
    };
    get_load(req.params.id).then((load) => {
        if(load[0] === null || load[0] === undefined) {
            res.status(404).send('{ "Error": "No load with this load_id exists" }');
        }

        // if an attribute is not in request body, set to current value
        let volume = 0;
        let item = '';
        let creation_date = '';
        if(req.body.volume) {
            volume = req.body.volume;
        }
        else {
            volume = load[0].volume;
        }
        if(req.body.item) {
            item = req.body.item;
        }
        else {
            item = load[0].item;
        }
        if(req.body.creation_date) {
            creation_date = req.body.creation_date;
        }
        else {
            creation_date = load[0].creation_date;
        }
        put_load(req.params.id, volume, item, creation_date).then(res.status(200).send(generate_response(req.params.id, volume, item, creation_date, load[0].carrier, req)));
    })
});

router.delete('/:id', function(req, res){
    get_load(req.params.id).then(load => {
        if (load[0] === null || load[0] === undefined) {
            res.status(404).send('{ "Error": "No load with this load_id exists" }');
        }
        else {
            delete_load(req.params.id).then(res.status(204).end());
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