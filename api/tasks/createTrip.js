'use strict';

const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.TABLE_NAME;

module.exports.handler = async (event = {}) => {
  console.log('Event: ', JSON.stringify(event, null, 2));

  try {
    const { body = '{}', headers } = event;
    const { 'nomadland-user': user_id } = headers;
    const request = JSON.parse(body);

    const user = await createUser(user_id, request);
    return {
      statusCode: 200,
      body: JSON.stringify({ user }, null, 2),
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

const createUser = async (user_id, request = {}) => {
  const trip_id = `TR${uuidv4()}`;
  const { start, end, city, country } = request;

  if (!start) throw { status: 400, message: `Start date required` };
  else if (!end) throw { status: 400, message: `End date required` };
  else if (!city) throw { status: 400, message: `City date required` };
  else if (!country) throw { status: 400, message: `Country date required` };

  const location = `${city.toLowerCase().trim()},${country.toLowerCase().trim()}`;
  const metadata = {
    start,
    end,
    id: trip_id,
    user_id,
    country,
    city,
    location,
  };

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (!startDate || startDate.getTime() < Date.now())
    throw { status: 400, message: `Invalid start date: ${start}` };
  else if (!endDate || endDate.getTime() < Date.now())
    throw { status: 400, message: `Invalid end date: ${end}` };
  else if (startDate.getTime() > endDate.getTime())
    throw { status: 400, message: `Start time can't be greater than end time` };
  else if (endDate.getTime() < startDate.getTime())
    throw { status: 400, message: `End time can't be greater than start time` };

  const now = Date.now();
  const params = {
    TransactItems: [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            pk: `TRIP#${trip_id}`,
            sk: `TRIP#${trip_id}`,
            data: `#`,
            metadata,
          },
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            pk: `TRIP#${trip_id}`,
            sk: 'CREATED',
            data: `TRIP#OPEN#${new Date(now).toISOString()}`,
            metadata,
          },
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            pk: `TRIP#${trip_id}`,
            sk: 'TRIP#START',
            data: `TRIP#OPEN#${startDate.toISOString()}`,
          },
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            pk: `TRIP#${trip_id}`,
            sk: 'TRIP#END',
            data: `TRIP#OPEN#${endDate.toISOString()}`,
          },
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            pk: `TRIP#${trip_id}`,
            sk: 'TRIP#LOCATION',
            data: `TRIP#OPEN#${location}`,
            metadata,
          },
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            pk: `TRIP#${trip_id}`,
            sk: `USER#${user_id}`,
            data: `TRIP#OPEN#${startDate.toISOString()}#${endDate.toISOString()}`,
            metadata,
          },
        },
      },
    ],
  };

  await dynamo.transactWrite(params).promise();

  const durationMillis = endDate.getTime() - startDate.getTime();
  const durationDays = durationMillis / 1000 / 60 / 60 / 24;

  for (let i = 0; i < durationDays; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const params = {
      TableName: TABLE_NAME,
      Item: {
        pk: `TRIP#${trip_id}`,
        sk: `TRIP#${location}#${date.toISOString()}`,
        data: `TRIP#OPEN#${user_id}`,
      },
    };

    await dynamo.put(params).promise();
  }
  const user = params.TransactItems.shift().Put.Item;
  return user;
};
