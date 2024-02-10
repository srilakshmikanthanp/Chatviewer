// Copyright (c) 2022 Sri Lakshmi Kanthan P
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { IJwtChatPayload } from '../interfaces';
import { Request, Response } from 'express';
import { sequelize } from '../database';
import { User, Chat } from '../models';
import { QueryTypes } from 'sequelize';
import * as jwt from 'jsonwebtoken';

// post chat controller function
export async function postChatController(req: Request, res: Response) {
  // get the user id and validate it
  const userID = +res.locals.user_auth_payload?.userId

  // id from the url should be same as the id from the jwt
  if (!userID) {
    return res.status(403).json({ message: 'Not a valid token' });
  }

  // get the user data from the database
  const user = await User.findOne({ where: { userId: userID } });

  // if user is not found
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // get mime type from base64 data
  const mimeType = req.body.base64.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0];

  // get base64
  const base64 = req.body.base64.split(',')[1];

  // get the chat data from the request body
  const data = Buffer.from(base64, 'base64');

  // set the chat id in the user data
  const chat = await user.createChat({
    mimeType: mimeType,
    data: data,
    name: req.body.name
  });

  // send the success response
  res.status(200).json({
    blobUrl: `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}${chat.chatId}/blob`,
    chatId: chat.chatId,
    userId: chat.userId,
    name: chat.name,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt
  });
}

// get all chats controller function
export async function getAllChatsController(req: Request, res: Response) {
  // get the user id and validate it
  const userID = +res.locals.user_auth_payload?.userId

  // id from the url should be same as the id from the jwt
  if (!userID) {
    return res.status(403).json({ message: 'Not a valid token' });
  }

  // get the user data from the database
  const user = await User.findOne({ where: { userId: userID } });

  // if user is not found
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // get the per-page from query
  const perPage = +req.query['perPage'];

  // get the page from query
  const page = +req.query['page'];

  // get the sort-by
  const sortBy = req.query['sortBy'];

  // if per page, page are not a number
  if (!perPage || !page) {
    return res.status(400).json({ message: 'Invalid perPage or page' });
  }

  // if it is not a string
  if (typeof sortBy !== 'string' || !['createdAt', "name" , 'updatedAt'].includes(sortBy)) {
    return res.status(400).json({
      message: 'shortBy Should be name, createdAt or updatedAt'
    });
  }

  // query string
  let ChatQuery = `
    SELECT chatId, userId, name, createdAt, updatedAt
    FROM ${Chat.tableName} WHERE userId = ?
  `;

  // if has short by then add it to the query string
  if (sortBy) {
    ChatQuery += ` ORDER BY ${sortBy == "updatedAt" ? sortBy  + " DESC" : sortBy} `;
  }

  // if per_page is present and page is present
  if (perPage && page) {
    ChatQuery += ` LIMIT ${perPage} OFFSET ${perPage * (page - 1)}`;
  }

  // get chats with raw query
  const results = (await sequelize.query(ChatQuery, {
    type: QueryTypes.SELECT,
    replacements: [userID]
  })) as [
    {
      chatId: number;
      userId: number;
      name: string;
      createdAt: Date;
      updatedAt: Date;
    }
  ];

  // add the blob url
  const chats = results.map((chat) => {
    return {
      blobUrl: `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}${chat.chatId}/blob`,
      chatId: chat.chatId,
      userId: chat.userId,
      name: chat.name,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt
    };
  });

  // query to count the total number of chats
  const countQuery = `SELECT COUNT(*) as total FROM ${Chat.tableName} WHERE userId = ?`;

  // get the total number of chats
  const total = +(
    (await sequelize.query(countQuery, {
      type: QueryTypes.SELECT,
      replacements: [userID],
      plain: true
    })) as {
      total: number;
    }
  ).total;

  // construct the link header
  if (perPage && page) {
    const topMostUrl  =   `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const totalPages  =   Math.ceil(total / perPage);
    const links       =   [];

    if (page > 1) {
      links.push(`<${topMostUrl}?page=${page - 1}&per_page=${perPage}>; rel="prev"`);
    }

    if (page < totalPages) {
      links.push(`<${topMostUrl}?page=${page + 1}&per_page=${perPage}>; rel="next"`);
    }

    res.setHeader('Link', links.join(', '));
  }

  // send the success response
  res.status(200).json(chats);
}

// get chat by id controller function
export async function getChatByIdController(req: Request, res: Response) {
  // get the user id and validate it
  const userID = +res.locals.user_auth_payload?.userId

  // id from the url should be same as the id from the jwt
  if (!userID) {
    return res.status(403).json({ message: 'Not a valid token' });
  }

  // get the user data from the database
  const user = await User.findOne({ where: { userId: userID } });

  // if user is not found
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // chat id
  const chatId = +req.params.chat_id;

  // get chat with raw query
  const chat = await Chat.findOne({ attributes: { exclude: ['data'] },  where: { chatId: chatId, userId: userID } });

  // if chat is not found
  if (!chat) {
    return res.status(404).json({ message: 'Chat not found' });
  }

  // send the success response
  res.status(200).json({
    blobUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}/blob`,
    chatId: chat[0].chatId,
    userId: chat[0].userId,
    name: chat[0].name,
    createdAt: chat[0].createdAt,
    updatedAt: chat[0].updatedAt
  });
}

// patch chat by id controller function
export async function patchChatByIdController(req: Request, res: Response) {
  // get the user id from JWt and url and validate it
  const userID = +res.locals.user_auth_payload?.userId

  // id from the url should be same as the id from the jwt
  if (!userID) {
    return res.status(403).json({ message: 'Not a valid token' });
  }

  // get the user data from the database
  const user = await User.findOne({ where: { userId: userID } });

  // if user is not found
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // chat id
  const chatId = +req.params.chat_id;

  // get the chat name from the request body
  const name = req.body.name;

  // update the chat name with raw query
  const result = await Chat.update({ name: name }, { where: { userId: userID, chatId: chatId } });

  // if chat is not found
  if (result[0] != 1) {
    return res.status(404).json({ message: 'Chat not found' });
  }

  // get the chat with raw query
  const chat = await Chat.findOne({ attributes: { exclude: ['data'] },  where: { userId: userID, chatId: chatId } });

  // send the success response
  res.status(200).json({
    blobUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}/blob`,
    chatId: chat.chatId,
    userId: chat.userId,
    name: chat.name,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt
  });
}

// delete chat by id controller function
export async function deleteChatByIdController(req: Request, res: Response) {
  // get the user id and validate it
  const userID = +res.locals.user_auth_payload?.userId

  // id from the url should be same as the id from the jwt
  if (!userID) {
    return res.status(403).json({ message: 'Not a valid token' });
  }

  // get the user data from the database
  const user = await User.findOne({ where: { userId: userID } });

  // if user is not found
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // chat id
  const chatId = +req.params.chat_id;

  // get the chat data from the database
  const chat = await Chat.findOne({ where: { chatId: chatId, userId: userID } });

  // if chat is not found
  if (!chat) {
    return res.status(404).json({ message: 'Chat not found' });
  }

  // delete the chat
  await chat.destroy();

  // send the success response
  res.status(200).json({ message: 'ok' });
}

// get the chat blob controller function
export async function getChatBlobController(req: Request, res: Response) {
  // get the user id and validate it
  const userID = +res.locals.user_auth_payload?.userId

  // id from the url should be same as the id from the jwt
  if (!userID) {
    return res.status(403).json({ message: 'Not a valid token' });
  }

  // get the user data from the database
  const user = await User.findOne({ where: { userId: userID } });

  // if user is not found
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // chat id
  const chatId = +req.params.chat_id;

  // get the chat data from the database
  const chat = await Chat.findOne({ where: { chatId: chatId, userId: userID } });

  // if chat is not found
  if (!chat) {
    return res.status(404).json({ message: 'Chat not found' });
  }

  // get the blob
  const blob = chat.data;

  // set the content type
  res.setHeader('Content-Type', chat.mimeType);

  // send the success response
  res.status(200).send(blob);
}

// share chat by id controller function
export async function getTokenByIdController(req: Request, res: Response) {
  // get the user id and validate it
  const userID = +res.locals.user_auth_payload?.userId

  // id from the url should be same as the id from the jwt
  if (!userID) {
    return res.status(403).json({ message: 'Not a valid token' });
  }

  // get the user data from the database
  const user = await User.findOne({ where: { userId: userID } });

  // if user is not found
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // chat id
  const chatId = +req.params.chat_id;

  // if chat is not found
  if (!user.hasChat(chatId)) {
    return res.status(404).json({ message: 'Chat not found' });
  }

  // payload
  const payload: IJwtChatPayload = { chatId: chatId };

  // get the expiry
  const expiry = req.query.expiresIn ? req.query.expiresIn : '30d';

  // if it is not a string
  if (typeof expiry !== 'string') {
    return res.status(400).json({
      message: 'expiresIn Should be string'
    });
  }

  try {
    // generate a jwt token
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: expiry
    });

    // send response
    res.setHeader('chat-token', token).status(200).send({
      message: 'ok'
    });
  } catch (error) {
    // send error response
    res.status(400).send({ message: 'Invalid expiresIn' });
  }
}

// get chat with the jwt token controller
export async function getChatWithJwtController(req: Request, res: Response) {
  // secret key to verify the token
  const JwtSecret = process.env.JWT_SECRET;

  // get the token from the request
  const JwtToken = req.params.token;

  // verify the token
  try {
    // constants
    const decoded: IJwtChatPayload = jwt.verify(JwtToken, JwtSecret) as IJwtChatPayload;

    // query string
    const query = `
      SELECT chatId, userId, createdAt, updatedAt
      FROM ${Chat.tableName} WHERE chatId = ?
    `;

    // chat id
    const chatId = decoded.chatId;

    // get chat with raw query
    const chat = await sequelize.query(query, {
      replacements: [chatId],
      type: QueryTypes.SELECT,
    }) as [{
      chatId    : number,
      userId    : number,
      createdAt : Date,
      updatedAt : Date,
    }];

    // if chat is not found
    if (!chat.length) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // send the success response
    res.status(200).json({
      blobUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}/blob`,
      chatId: chat[0].chatId,
      userId: chat[0].userId,
      createdAt: chat[0].createdAt,
      updatedAt: chat[0].updatedAt,
    });
  } catch (error) {
    res.status(410).json({ message: error.message });
  }
}

// get blob with the jwt token controller
export async function getBlobWithJwtController(req: Request, res: Response) {
  // secret key to verify the token
  const JwtSecret = process.env.JWT_SECRET;

  // get the token from the request
  const JwtToken = req.params.token;

  // verify the token
  try {
    const decoded: IJwtChatPayload = jwt.verify(JwtToken, JwtSecret) as IJwtChatPayload;
    const chat = await Chat.findByPk(decoded.chatId);
    res.set('Content-Type', chat.mimeType);
    res.send(chat.data);
  } catch (error) {
    res.status(410).json({ message: error.message });
  }
}
