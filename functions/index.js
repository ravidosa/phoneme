/* eslint-disable promise/no-nesting */
/* eslint-disable promise/catch-or-return */
/* eslint-disable promise/always-return */
/* eslint-disable no-await-in-loop */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
require('dotenv').config();

// load the things we need
var express = require('express');
var app = express();
admin.initializeApp(functions.config().firebase);
const db = admin.firestore();
const storageRef = admin.storage().bucket();

var token = null

//load static files from /static
app.use('/static', express.static('static'))

// set the view engine to ejs
app.set('view engine', 'ejs');

const getFrontPage = async () =>  {
    const doc = await db.doc(`homepage-grid/grid-info`).get();
    const raw = doc.data().articles;
    var articles = Object.keys(raw);
    var gridloc = Object.values(raw);
    for (let i = 0; i < articles.length; i++) {
        articles[i] = await getArticleData(articles[i]);
    }
    data = {gridloc: gridloc, articles: articles}
    return data;
}

app.get('/', async (req, res) => {
    res.render('pages/index', await getFrontPage());
});

app.get('/about', (req, res) => {
	res.render('pages/about');
});

const getArticleData = async (id) =>  {
    const doc = await db.doc(`articles/${id}`).get()
    const data = doc.data()
    if (!data) {
        console.error('member does not exist')
        return
    }
    for (let i = 0; i < data.byline.length; i++) {
        const writer = await db.doc(`users/${data.byline[i]}`).get();
        const writerdata = writer.data();
        if (writerdata) {
            data.byline[i] = writerdata;
        }
        else {
            data.byline[i] = {name: data.byline[i]};
        }
    }
    if (data.permalinkphotobox) {
        data.permalinkphotobox.src = await storageRef.file('article-photos/' + data.permalinkphotobox.src).getSignedUrl({
            action: "read",
            expires: '03-17-2025' // this is an arbitrary date
        });
    }
    if (data.storyshadow) {
        data.storyshadow.src = await storageRef.file('article-photos/' + data.storyshadow.src).getSignedUrl({
            action: "read",
            expires: '03-17-2025' // this is an arbitrary date
        });
    }
    data.sidebar = await getSidebarData();
    return data;
}

const getSidebarData = async () => {
    const data = []
    await db.collection(`articles`).orderBy("timestamp", "desc").limit(5).get().then(querySnapshot => {
        querySnapshot.forEach(documentSnapshot => {
            data.push(documentSnapshot.data());
        });
        return
    });
    return data;
}

app.get('/article/:id',  async (req, res) => {
    res.render('pages/article', await getArticleData(req.params.id));
})

const getCategoryArticles = async (category, page) =>  {
    const data = {articles: []}
    await db.collection(`articles`).where("categories", "array-contains", category.replace(/-/g, " ")).orderBy("timestamp", "desc").limit(5).offset(5 * (page - 1)).get().then(querySnapshot => {
        querySnapshot.forEach(documentSnapshot => {
            data.articles.push(documentSnapshot.data());
        });
        return
    });
    data.category = category;
    data.page = page;
    data.sidebar = await getSidebarData();
    return data;
}

app.get('/category/:category',  async (req, res) => {
    if (!req.query.page) {
        req.query.page = 1;
    }
    res.render('pages/category', await getCategoryArticles(req.params.category, req.query.page));
})

const getTagArticles = async (tag, page) =>  {
    const data = {articles: []}
    await db.collection(`articles`).where("tags", "array-contains", tag.replace(/-/g, " ")).orderBy("timestamp", "desc").limit(5).offset(5 * (page - 1)).get().then(querySnapshot => {
        querySnapshot.forEach(documentSnapshot => {
            data.articles.push(documentSnapshot.data());
        });
        return
    });
    data.tag = tag;
    data.page = page;
    data.sidebar = await getSidebarData();
    return data;
}

app.get('/tag/:tag',  async (req, res) => {
    if (!req.query.page) {
        req.query.page = 1;
    }
    res.render('pages/tag', await getTagArticles(req.params.tag, req.query.page));
})

const getAllArticles = async (page) =>  {
    const data = {articles: []}
    await db.collection(`articles`).orderBy("timestamp", "desc").limit(5).offset(5 * (page - 1)).get().then(querySnapshot => {
        querySnapshot.forEach(documentSnapshot => {
            data.articles.push(documentSnapshot.data());
        });
        return
    });
    data.page = page;
    return data;
}

app.get('/all',  async (req, res) => {
    if (!req.query.page) {
        req.query.page = 1;
    }
    res.render('pages/all', await getAllArticles(req.query.page));
})

const getStaffList = async () =>  {
    const data = {stafflist: []};
    await db.collection(`users`).get().then(querySnapshot => {
        querySnapshot.forEach(documentSnapshot => {
            data.stafflist.push(documentSnapshot.data());
        });
        return
    });
    return data;
}

app.get('/staff',  async (req, res) => {
    res.render('pages/staff', await getStaffList());
})

const getStaff = async (id) =>  {
    const data = {};
    data.user = await db.collection('users').where("id", "==", id).get().then((querySnapshot) => {
        let users = [];
        querySnapshot.forEach((doc) => {
            users.push(doc.data());
        })
        return users[0];
    });
    data.articles = await db.collection(`articles`).where("byline", "array-contains", data.user.name).orderBy("timestamp", "desc").get().then(querySnapshot => {
        let articles = [];
        querySnapshot.forEach(documentSnapshot => {
            articles.push(documentSnapshot.data());
        });
        return articles;
    }).catch();
    return data;
}

app.get('/staff/:id',  async (req, res) => {
    res.render('pages/staffpage', await getStaff(req.params.id));
})

const checkAuth = (req, res, next) => {
    if (req.headers.authtoken) {
      admin.auth().verifyIdToken(req.headers.authtoken)
        .then((decodedToken) => {
            token = decodedToken
          next()
        }).catch(() => {
          res.status(403).send('Unauthorized')
        });
    }
    else if (token) {
        // eslint-disable-next-line callback-return
        next()
    }
    else {
      res.status(403).send('Unauthorized')
    }
}

app.get('/dashboard', checkAuth, async (req, res) => {
    const user = await db.collection('users').where("email", "==", token.email).get().then((querySnapshot) => {
        let users = [];
        querySnapshot.forEach((doc) => {
            users.push(doc.data());
        });
        if (users[0]) {
            token.user = users[0];
            return users[0];
        }
    });
    const approved = await db.collection('articles').where("byline", "array-contains", user.name).get().then((querySnapshot) => {
        let articles = [];
        querySnapshot.forEach((doc) => {
            articles.push(doc.data());
        });
        return articles;
    });
    const drafts = await db.collection('drafts').where("byline", "array-contains", user.name).get().then((querySnapshot) => {
        let articles = {"sub": [], "unsub": []}
        querySnapshot.forEach((doc) => {
            if (doc.data().submitted) {
            articles.sub.push(doc.data());
            }
            else {
            articles.unsub.push(doc.data());
            }
        });
        return articles;
    });
    let review = []
    if (user.position.includes("Editor")) {
        review = await db.collection('drafts').where("submitted", "==", true).get().then((querySnapshot) => {
            let articles = [];
            querySnapshot.forEach((doc) => {
                articles.push(doc.data());
            });
            return articles;
        });
    }
    res.render('pages/dashboard', {userInfo: {name: user.name, position: user.position}, review: review, submitted: drafts.sub, approved: approved, drafts: drafts.unsub})
});

app.get('/dashboard/editor', checkAuth, async (req, res) => {
    data = {token: token}
    res.render('pages/editor', data)
});

app.get('/dashboard/editor/draft/:id', checkAuth, async (req, res) => {
    const doc = await db.doc(`drafts/${req.params.id}`).get();
    const data = doc.data();
    data.token = token;
    res.render('pages/editor', data)
});

app.get('/dashboard/editor/article/:id', checkAuth, async (req, res) => {
    const doc = await db.doc(`articles/${req.params.id}`).get();
    const data = doc.data();
    data.token = token;
    res.render('pages/editor', data)
});

app.get('/dashboard/customize', checkAuth, async (req, res) => {
    res.render('pages/customize')
});
 
app.get('/login', (req, res) => {
    res.render('pages/login');
});

app.get('/reset', (req, res) => {
    res.render('pages/reset');
});

app.post('/auth', checkAuth, (req, res) => {
    res.redirect('/dashboard');
});

app.post('/unauth', (req, res) => {
    token = null;
    res.status(200).send('Logged out.')
});

app.post('/upload-draft', checkAuth, async (req, res) => {
    db.collection("drafts").doc(req.body.id).set(req.body, { merge: true })
    .catch((error) => {
        res.status(500).send("Error saving article. Please retry.");
    });
    res.status(200).send('Article uploaded.')
});

app.post('/approve-draft', checkAuth, async (req, res) => {
    req.body.timestamp = new Date();
    db.collection("articles").doc(req.body.id).set(req.body, { merge: true })
    .catch((error) => {
        res.status(500).send("Error saving article. Please retry.");
    });
    db.collection('drafts').doc(req.body.id).delete();
    res.status(200).send('Article uploaded.')
});

app.post('/approve-all', checkAuth, async (req, res) => {
    await db.collection('drafts').where("submitted", "==", true).get().then((querySnapshot) => {
      querySnapshot.forEach(async(doc) => {
        data = doc.data();
        data.timestamp = new Date()
        delete data.submitted
        await db.collection("articles").doc(doc.data().id).set(data);
        await db.collection("drafts").doc(doc.data().id).delete();
      });
    });
    res.status(200).send('Articles uploaded.')
});

exports.app = functions.https.onRequest(app);