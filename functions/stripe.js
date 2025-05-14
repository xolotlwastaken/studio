const functions = require("firebase-functions");
const Stripe = require("stripe");
const admin = require("firebase-admin"); // Import Firebase Admin SDK

const config = {
  stripe: {
    secret_key: process.env.STRIPE_SECRET_KEY || "",
    weekly_price_id: process.env.STRIPE_WEEKLY_PRICE_ID || "",
    monthly_price_id: process.env.STRIPE_MONTHLY_PRICE_ID || "",
    yearly_price_id: process.env.STRIPE_YEARLY_PRICE_ID || "",
  },
  stripe_webhook: {secret: process.env.STRIPE_WEBHOOK_SECRET || ""},
  app: {url: process.env.APP_URL || ""},
};

const stripe = new Stripe(config.stripe.secret_key, {
  apiVersion: "2023-10-16", // Set your desired Stripe API version
});

exports.createStripeCheckoutSession =
functions.https.onCall(async (request) => {
  console.log("Cloud Function Called!");
  console.log("Context Auth:", request.auth); // Log the auth context
  const {plan} = request.data;
  const userId = request.auth.uid;
  console.log("Data:"); // Log the received data
  console.log("Plan:", plan, "UserId:", userId); // Log plan and userId

  if (!request.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
    );
  }

  if (!plan || !userId) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "The `plan` parameter is required.",
    );
  }

  let priceId;
  switch (plan) {
    case "weekly":
      priceId = config.stripe.weekly_price_id;
      break;
    case "monthly":
      priceId = config.stripe.monthly_price_id;
      break;
    case "yearly":
      priceId = config.stripe.yearly_price_id;
      break;
    default:
      throw new functions.https.HttpsError(
          "invalid-argument",
          "Invalid plan provided.",
      );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId: userId,
      },
      success_url:
        `${config.app.url}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.app.url}/subscription`,
      automatic_tax: {enabled: true},
    });

    return {
      url: session.url,
      sessionId: session.id,
      userId: session.metadata.userId,
      message: "Checkout session created successfully.",
    };
  } catch (error) {
    console.error(
        "Error creating Stripe checkout session:",
        error,
    );
    throw new functions.https.HttpsError(
        "internal",
        "Unable to create checkout session.",
        error,
    );
  }
});

exports.handleStripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = config.webhook.secret;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event) {
    switch (event.type) {
      case "checkout.session.completed":
        {
          const session = event.data.object;
          console.log(
              "Checkout session completed:",
              session.id,
          );
          const stripeCustomerId = session.customer;
          const stripeSubscriptionId = session.subscription;
          const userId = session.metadata.userId;

          if (userId) {
            try {
              await admin.firestore().collection("users").doc(userId).update({
                stripeCustomerId: stripeCustomerId,
                stripeSubscriptionId: stripeSubscriptionId,
                isOnTrial: false,
                isSubscribed: true,
              });
              console.log(`User ${userId} updated with subscription info.`);
            } catch (error) {
              // Error retrieving subscription or updating user
              console.error(
                  `Error updating user ${userId} in database:`,
                  error,
              );
            }
          }
        }
        break;
      case "customer.subscription.deleted":
      {
        const subscription = event.data.object;
        console.log("Subscription deleted:", subscription.id);
        const customerId = subscription.customer;

        try {
          // Find the user in your database by their stripeCustomerId
          const userQuerySnapshot = await
          admin
              .firestore()
              .collection("users")
              .where("stripeCustomerId", "==", customerId).limit(1).get();
          if (!userQuerySnapshot.empty) {
            const userIdToDeleteSubscription = userQuerySnapshot.docs[0].id;
            await
            admin
                .firestore()
                .collection("users")
                .doc(userIdToDeleteSubscription)
                .update({
                  isSubscribed: false,
                  stripeSubscriptionId:
                  admin
                      .firestore
                      .FieldValue
                      .delete(), // Remove subscription ID
                });
            console.log(
                `User ${userIdToDeleteSubscription} 
                subscription status updated to false.`,
            );
          } else {
            console.warn(
                `User with Stripe Customer ID ${customerId} 
                not found in database.`,
            );
          }
        } catch (error) {
          console.error(
              `Error updating user subscription status:`,
              error,
          );
        }
        break;
      }
      // Handle other event types as needed
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  }

  // Return a response to acknowledge receipt of the event
  res.json({received: true});
});
