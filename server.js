const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const ds = require('./datastore');
const path = require('path');

const { auth } = require('express-openid-connect');
const { requiresAuth } = require('express-openid-connect');

const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const datastore = ds.datastore;

const USER = "User";

const CLIENT_ID = 'Ghs4JlhSUyy7h7Wm7h3Sdljkx3pHalep';
const CLIENT_SECRET = 'xxx';
const DOMAIN = 'dev-xgso6y32tqja1nvc.us.auth0.com';

const config = {
    authRequired: false,
    auth0Logout: true,
    baseURL: 'https://portfolio-critchfn.uw.r.appspot.com',
    clientID: CLIENT_ID,
    issuerBaseURL: 'https://' + DOMAIN,
    secret: CLIENT_SECRET
  };


app.use(bodyParser.json());
app.use('/', require('./index'));
app.enable('trust proxy');

app.use(auth(config));

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


/* ------------- Begin Users Model Functions ------------- */
function post_user(user_id){
  var key = datastore.key(USER);
  const new_user = {"user_id": user_id};
  return datastore.datastore.save({"key":key, "data":new_user}).then(() => {return key});
}

function get_user(user_id) {
  const q = datastore.datastore.createQuery(USER);
	return datastore.datastore.runQuery(q).then( (entities) => {
			return entities[0].map(ds.fromDatastore).filter( user => user.user_id === user_id );
		});
}

function get_users(req){
  var q = datastore.createQuery(USER);
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

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */
app.get('/users', function(req, res){
  const users = get_users(req)
  .then( (users) => {
      res.status(200).send('{ "users":' + JSON.stringify(users["items"]) + '} ');
  });
});

app.get('/', (req, res) => {
  res.send(req.oidc.isAuthenticated() ? res.redirect('/profile') : res.redirect('/welcome'));
});

app.get('/welcome', (req, res) => {
  res.sendFile(path.join(__dirname, '/views/welcome.html'));
});

app.get('/profile', requiresAuth(), (req, res) => {
  let token = req.oidc.idToken;

  get_user(req.oidc.user.sub).then((user) => {
    if (user.length === 0) {
      post_user(req.oidc.user.sub).then(() => {
        res.send('User ID: ' + req.oidc.user.sub + ', Token: ' + token);
      });
    }
    else {
      res.send('User ID: ' + req.oidc.user.sub + ', Token: ' + token);
    }
  })
});

/* ------------- End Controller Functions ------------- */


// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});
