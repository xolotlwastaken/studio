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

exports.createTrialSubscription =
functions.https.onCall(async (request) => {
  try {
    const uid = request.auth.uid;
    if (!uid) {
      throw new functions.https.HttpsError(
          "unauthenticated",
          "User must be logged in",
      );
    }

    const customer = await stripe.customers.create({
      metadata: {firebaseUID: uid},
      email: request.auth.token.email,
    });
    const customerId = customer.id;

    const priceId = config.stripe.weekly_price_id;
    const trialDays = 1;

    // Create the subscription with trial and no payment method
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{price: priceId}],
      trial_period_days: trialDays,
      payment_behavior: "default_incomplete", // avoids charge or invoice
      cancel_at_period_end: true,
    });
    [];
    // Store subscription details in Firestore
    await admin.firestore().collection("users").doc(uid).update({
      stripeCustomerId: customerId,
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionTrialEnd:
        admin.firestore.Timestamp.fromMillis(subscription.trial_end * 1000),
    });

    return {
      message: "Trial subscription created successfully",
      subscriptionId: subscription.id,
      trialEnds: subscription.trial_end,
    };
  } catch (error) {
    console.error("[createTrialSubscription]", error);
    throw new functions.https.HttpsError(
        "internal",
        error.message,
    );
  }
});

exports.createStripeCheckoutSession =
functions.https.onCall(async (request) => {
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
        planType: plan, // Include plan type in metadata
        userId: userId,
      },
      success_url:
        `${config.app.url}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
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

exports.cancelStripeSubscription =
functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
    );
  }

  const userId = request.auth.uid;
  console.log("Attempting to cancel subscription for user:", userId);

  try {
    // Get the user's Stripe subscription ID from Firestore
    const userDocRef = admin.firestore().collection("users").doc(userId);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
          "not-found",
          "User document not found.",
      );
    }

    const {stripeSubscriptionId} = userDoc.data();

    if (!stripeSubscriptionId) {
      console.log("User does not have an active subscription.");
      return {success: true, message: "No active subscription to cancel."};
    }

    // Cancel the subscription in Stripe
    await stripe.subscriptions.cancel(stripeSubscriptionId);

    // Update the user's document to reflect the cancellation
    await userDocRef.update({
      isSubscribed: false,
      stripeSubscriptionId: admin.firestore.FieldValue.delete(),
      planType: admin.firestore.FieldValue.delete(),
    });

    console.log(
        "Subscription canceled successfully for user:",
        userId,
    );
    return {success: true};
  } catch (error) {
    console.error("Error canceling subscription:", error);
    throw new functions.https.HttpsError(
        "internal",
        "Failed to cancel subscription.",
        error,
    );
  }
});

exports.createCustomerPortal = functions.https.onCall(async (request) => {
  const uid = request.auth.uid;

  const userDoc = await admin.firestore().collection("users").doc(uid).get();
  const customerId = userDoc.data().stripeCustomerId;

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.app.url}`, // redirect to home after portal close
  });

  return {url: session.url};
});

exports.handleStripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = config.stripe_webhook.secret;
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
          const planType = session.metadata.planType;

          // Fetch the full subscription to get the priceId
          const subscription =
            await stripe.subscriptions.retrieve(stripeSubscriptionId);
          const priceId = subscription.items.data[0].price.id;
          const status = subscription.status;
          const periodEnd = subscription.current_period_end;

          if (userId) {
            try {
              await admin.firestore().collection("users").doc(userId).update({
                stripeCustomerId: stripeCustomerId,
                stripeSubscriptionId: stripeSubscriptionId,
                subscriptionPriceId: priceId,
                // isOnTrial: false,
                subscriptionStatus: status,
                subscriptionEndDate: admin.firestore.Timestamp.fromMillis(
                    periodEnd * 1000,
                ),
                planType: planType,
              });
              // console.log(`User ${userId} updated with subscription info.`);
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
                  subscriptionStatus: subscription.status,
                  subscriptionEndDate: admin.firestore.Timestamp.fromMillis(
                      subscription.items.data[0].current_period_end * 1000,
                  ),
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
      case "customer.subscription.updated":
      {
        const subscription = event.data.object;
        console.log("Subscription updated:", subscription.id);
        const customerId = subscription.customer;

        // If upgrade trial, set cancel_at_period_end to false
        if (event.data.previous_attributes.status === "trialing" &&
          subscription.status === "active") {
          await stripe.subscriptions.update(subscription.id, {
            cancel_at_period_end: false,
          });
        }

        try {
          // Find the user in your database by their stripeCustomerId
          const userQuerySnapshot = await
          admin
              .firestore()
              .collection("users")
              .where("stripeCustomerId", "==", customerId).limit(1).get();
          if (!userQuerySnapshot.empty) {
            const userIdToUpdateSubscription = userQuerySnapshot.docs[0].id;
            await
            admin
                .firestore()
                .collection("users")
                .doc(userIdToUpdateSubscription)
                .update({
                  subscriptionStatus: subscription.status,
                  subscriptionPriceId: subscription.items.data[0].price.id,
                  subscriptionEndDate: admin.firestore.Timestamp.fromMillis(
                      subscription.items.data[0].current_period_end * 1000,
                  ),
                });
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

