const User = require('../models/UserSchema');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const generateToken = require('../services/token.service');
const LoggedInUsers = require('../utils/users.socket');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        let user = await User.findOne({ email })
            .populate({ path: 'friendList', model: 'User', select: '-password' })
            .populate({ path: 'friendRequests', model: 'FriendRequest', select: '-password' })
            .populate({ path: 'friendList', populate: { path: 'photos' }, select: '-password' })
            .lean();

        if (!user) {
            return res.status(400).json({ error: `Invalid credentials.` });
        }
        if (user.ban) {
            return res.status(403).json({ error: 'Your account has been suspended.' });
        }

        if (!user.accountConfirmed) {
            return res.status(403).json({ error: 'Please confirm your account.' })
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const accessToken = generateToken(user, 'access_token');
        const refreshToken = generateToken(user, 'refresh_token');
        user.friendList = user.friendList.map(friend => {
            const currentPhoto = friend.photos.find(photo => photo.isMain);
            // console.log({ friend })
            return {
                ...friend,
                currentPhoto
            }
        })
        user.accessToken = accessToken;

        res.cookie('jwt', refreshToken, { httpOnly: true, maxAge: 3600000 })
        const io = req.app.get('socketio')
        const loggedInUsers = LoggedInUsers.getInstance();

        // const socketId = loggedInUsers.getUser()
        // const socket = io.sockets.sockets[socket.id]
        return res.status(200).json(user)

    }
    catch (error) {
        return res.status(500).json({ error: error.message })
    }
}
const logout = (req, res) => {
    res.clearCookie('jwt');
    // revokeToken();
    return res.status(200).json({ message: 'logged out successfuly' });

}

const refreshToken = async (req, res) => {
    try {
        let refreshToken = req.cookies?.jwt;
        console.log(req.cookies)
        let payload = jwt.decode(refreshToken, process.env.REFRESH_TOKEN_SECRET)
        console.log({ payload })

        let isRefreshTokenValid = payload.exp * 1000 > Date.now()

        if (!isRefreshTokenValid) {
            res.clearCookie('jwt');
            return res.status(403).json({ message: 'Invalid Refesh token' })
        }
        const user = await User.findById(payload.id);
        const accessToken = generateToken(user, 'access_token');
        refreshToken = generateToken(user, 'refresh_token');
        res.cookie('jwt', refreshToken, { httpOnly: true, maxAge: 3600000 })
        return res.status(200).json({ accessToken })
    } catch (error) {
        return res.status(500).json({ error })
    }
}

const revoke = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);;
        if (!user) {
            return res.status(400).json({ error: 'Bad Request can not revoke token' })
        }
        user.tokenVersion++
        await user.save();
        return res.status(200).json({ message: 'Token successfully revoked' })
    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}


const confirmAccount = async (req, res) => {
    try {
        const { token } = req.params;
        console.log(token)
        const payload = jwt.verify(token, process.env.EMAIL_TOKEN_SECRET);

        console.log({ payload })

        const user = await User.findByIdAndUpdate(payload.id, { accountConfirmed: true })
        // await user.save();
        console.log({ user })

        return res.status(200).json({ message: "Account has been confirmed" });
    } catch (error) {
        return res.status(500).json({ error: "Something went wrong when confirming account : " + error.message });
    }
}

module.exports = { login, logout, refreshToken, refreshToken, revoke, confirmAccount }