'use strict';

const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.TABLE_NAME;

module.exports.handler = async (event = {}) => {
  console.log('Event: ', JSON.stringify(event, null, 2));

  try {
    const { body = '{}' } = event;
    const request = JSON.parse(body);

    const reccomendation = await createReccomendation(request);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, result: { reccomendation } }, null, 2),
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ message: err.message || 'An unknown error occured' }, null, 2),
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    };
  }
};

const createReccomendation = async (request = {}) => {
  const reccomendation_id = `RE${uuidv4()}`;
  const { location, url, capacity, bedrooms, price, speed } = request;

  const metadata = {
    location,
    url,
    capacity,
    bedrooms,
    price,
    speed,
  };

  const now = Date.now();
  const params = {
    TransactItems: [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            pk: `RECCOMENDATION#${reccomendation_id}`,
            sk: `RECCOMENDATION#${reccomendation_id}`,
            data: `#`,
            metadata,
          },
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            pk: `RECCOMENDATION#${reccomendation_id}`,
            sk: 'CREATED',
            data: `RECCOMENDATION#OPEN#${new Date(now).toISOString()}`,
          },
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            pk: `RECCOMENDATION#${reccomendation_id}`,
            sk: `LOCATION#${location}`,
            data: `RECCOMENDATION#OPEN#${new Date(now).toISOString()}`,
            metadata,
          },
        },
      },
    ],
  };

  await dynamo.transactWrite(params).promise();

  const reccomendation = params.TransactItems.shift().Put.Item;
  return reccomendation;
};
