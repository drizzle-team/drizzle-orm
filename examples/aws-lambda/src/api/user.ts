import { APIGatewayEvent, Context } from "aws-lambda";
import { db } from "db";

export const getAll = async (event: APIGatewayEvent, context: Context) => {
  try {
    const users = await db.query.users.findMany();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(users),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(error),
    };
  }
};
