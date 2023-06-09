const router = require('express').Router();
const authenticationMiddleware = require('../middlewares/auth.middleware');
const postModel = require('../models/Post');
const userModel = require('../models/UserSchema');
const { createNotificationService } = require("../services/notification.service");
const LoggedInUsers = require('../utils/users.socket');
const upload = require('../configs/multer.config');


// create post 
router.post("/create", upload.single('image'), async (req, res) => {
  let image;
  if (req.file) {
    image = req?.file?.path;
  } else {
    image = '';
  }
  const newPost = new postModel({ ...req.body, image })
  try {
    const savedPost = await newPost.save();
    res.status(200).json(savedPost)
  }
  catch (err) {
    res.status(500).json(err)
  }

})

// all post 
router.get("/timeline/all", async (req, res) => {
  try {
    const posts = await postModel.find({}).populate({ path: 'userId', model: 'User' });
    return res.status(200).json(posts)
  } catch (err) {
    res.status(500).json(err);
  }
});


// update post 
router.put("/:id", async (req, res) => {
  const post = await postModel.findById(req.params.id).populate({ path: 'userId', model: 'User' });
  try {
    if (post.userId === req.body.user) {
      // await post.updateOne({ $set: req.body })
      const post = await postModel.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate({ path: 'userId', model: 'User' });
      // res.status(200).json("the post has been updated")
      res.status(200).json(post)

    }
    else {
      res.status(403).json("you can update only your post")
    }
  }
  catch (err) {
    res.status(500).json(err)
  }

})

// delete post 

router.delete("/:id", async (req, res) => {
  const post = postModel.findById(req.params.id);
  try {
    if (post.userId === req.body.id) {
      await post.deleteOne();
      res.status(200).json("the post has been deleted")

    }
    else {
      res.status(403).json("you can delete only your post")
    }
  }
  catch (err) {
    res.status(500).json(err)
  }
})


// like & dislike post 
router.put("/:id/like", async (req, res) => {
  try {
    const post = await postModel.findById(req.params.id).populate({ path: 'userId', model: 'User' });

    // console.log(req.body.userId);

    if (!post.likes.includes(req.body.userId)) {
      await post.updateOne({ $push: { likes: req.body.userId } })
      await createNotificationService({ type: 'like', sender: req.body.userId, receiver: post.userId._id, content: post._id })
      // console.log({ sender: userId, receiver: post.userId._id, content: post._id })

      const io = req.app.get('socketio')
      const loggedInUsers = LoggedInUsers.getInstance();
      const socketId = loggedInUsers.getUser(post.userId._id.toString())

      io.to(socketId).emit("notification", {
        type: 'like',
        sender: req.body.userId,
        receiver: post.userId._id,
        content: `${post.userId.firstname} ${post.userId.lastname} Liked your post.`
      });

      res.status(200).json("the post has been liked")
    }
    else {
      await post.updateOne({ $pull: { likes: req.body.userId } })
      res.status(200).json("the post has been disliked")

    }

  }
  catch (err) {
    res.status(500).json(err)
  }
})


// get post 
router.get("/:id", async (req, res) => {
  try {
    const post = await postModel.findById(req.params.id).populate({ path: 'userId', model: 'User' });
    res.status(200).json(post)

  } catch (err) {
    res.status(500).json(err)
  }
})


// all post 
router.get("/timeline/all/:userId", async (req, res) => {
  try {
    const currentUser = await userModel.findById(req.params.userId);
    let userPosts = await postModel.find({ userId: currentUser._id })
      .populate({ path: 'userId', model: 'User' })
      .populate({ path: 'userId.photos', model: 'Photo' })
      .lean();
    // userPosts.userId.currentPhoto = userPosts.userId.photos.find(photo => photo.isMain);
    // console.log(userPosts)
    // console.log({ userPosts })

    userPosts = userPosts.map(post => {
      const currentPhoto = post.userId.photos.find(photo => photo.isMain);
      return { ...post, currentPhoto };
    })
    // userPosts.forEach(post => console.log(post.userId._id))

    // console.log({ currentUser })
    // if (currentUser.followersPeople.lenght > 0) {
    //   const friendPosts = await Promise.all(
    //     currentUser.followersPeople.map((friendId) => {
    //       return userPosts = postModel.find({ userId: friendId })
    //       // .populate({ path: 'userId', model: 'User' })
    //       // .populate({ path: 'userId.photos', model: 'Photo' });

    //       // userP.userId.currentPhoto = userP.photos.find(photo => photo.isMain);
    //       // return userP;
    //       // return userPosts;

    //       // return userPosts;

    //     })
    //   );
    // }
    if (currentUser.followersPeople.length > 0) {
      const friendPosts = await Promise.all(
        currentUser.followersPeople.map((friendId) => {
          return postModel.find({ userId: friendId })
            .populate({ path: 'userId', model: 'User' })

        })
      );

      return res.json(userPosts.concat(...friendPosts))

    }


    // res.json(userPosts.concat(...friendPosts))
    return res.json(userPosts);
  } catch (err) {
    res.status(500).json(err);
  }
});

// all post  user
router.get("/profile/:username", async (req, res) => {
  try {
    const user = await userModel.findOne({ username: req.params.username })
    const posts = await postModel.find({ userId: user._id })
    res.status(200).json(posts)

  } catch (err) {
    res.status(500).json(err);
  }
});
// Share post
router.post("/:id/share", async (req, res) => {
  try {
    const originalPost = await postModel.findById(req.params.id);

    // create new post with same content as original post
    const repost = new postModel({
      userId: req.body.userId,
      desc: originalPost.desc,
      image: originalPost.image,
      tags: originalPost.tags,
      location: originalPost.location,
      hashtags: originalPost.hashtags,
      feeling: originalPost.feeling,
    });

    // save new post to database
    const savedRepost = await repost.save();

    // add new post to shares array of original post
    const updatedPost = await postModel.findByIdAndUpdate(
      req.params.id,
      {
        $push: { shares: savedRepost._id },
      },
      { new: true }
    );

    res.status(200).json(updatedPost);
  } catch (err) {
    res.status(500).json(err);
  }
});

//copy link 
router.get('/:id/copy-link', async (req, res) => {
  try {
    const post = await postModel.findById(req.params.id).populate({ path: 'userId', model: 'User' });
    const postLink = `${process.env.FRONT_URL}/posts/${post._id}`;
    res.send(postLink);
  } catch (error) {
    console.log(error);
    res.status(500).send('Error getting post link');
  }
});

// get posts by hashtag
router.get('/hashtags/:hashtag', async (req, res) => {
  try {
    const posts = await postModel.find({ hashtags: req.params.hashtag });
    res.status(200).json(posts);
  } catch (err) {
    res.status(500).json(err);
  }
});
// Report post as inappropriate
router.post('/:id/report', async (req, res) => {
  const postId = req.params.id;
  const { reason } = req.body;

  try {
    // Find the post by ID
    const post = await postModel.findById(postId);

    // Check if post exists
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Add report to post
    post.reports.push({ reason });
    await post.save();

    res.status(200).json({ message: 'Post reported as inappropriate' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});
//location to post 
router.post('/:postId/location', async (req, res) => {
  try {
    const postId = req.params.postId;
    const { latitude, longitude } = req.body;

    // Find the post by ID
    const post = await postModel.findById(postId);

    // Add the location to the post
    post.location = {
      type: 'Point',
      coordinates: [longitude, latitude]
    };

    // Save the post to the database
    const savedPost = await post.save();

    res.status(200).json(savedPost);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

//add feeling to post 
router.put('/:postId/feeling', async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    post.feeling = req.body.feeling;

    await post.save();

    res.status(200).json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});
//search 
router.get('/', async (req, res) => {
  const { hashtags } = req.query;

  const query = hashtags ? { hashtags: hashtags } : {};

  try {
    const hashtags = await postModel.find(query);
    res.json(hashtags);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



module.exports = router