import { connectToDatabase, disconnectFromDatabase } from '../db/connection';
import { Subscriber } from '../db/models';

async function testSubscriptionSystem() {
    console.log('🧪 Testing Subscription System...\n');

    try {
        // Connect to database
        console.log('📡 Connecting to MongoDB...');
        await connectToDatabase();
        console.log('✅ Connected successfully\n');

        // Test creating a subscriber
        console.log('👤 Testing subscriber creation...');
        const testChatId = 123456789; // Test chat ID
        const subscriber = new Subscriber({
            chatId: testChatId,
            username: 'testuser',
            firstName: 'Test',
            lastName: 'User',
            isActive: true,
            subscribedAt: new Date()
        });

        await subscriber.save();
        console.log('✅ Subscriber created successfully\n');

        // Test finding active subscribers
        console.log('🔍 Testing subscriber retrieval...');
        const activeSubscribers = await Subscriber.find({ isActive: true }).select('chatId username');
        console.log(`✅ Found ${activeSubscribers.length} active subscribers`);
        console.log('Active subscribers:', activeSubscribers.map(sub => ({
            chatId: sub.chatId,
            username: sub.username
        })));

        // Test updating subscriber
        console.log('\n🔄 Testing subscriber update...');
        await Subscriber.findOneAndUpdate(
            { chatId: testChatId },
            { lastName: 'Updated' }
        );
        console.log('✅ Subscriber updated successfully');

        // Test subscriber count
        console.log('\n📊 Testing subscriber statistics...');
        const totalCount = await Subscriber.countDocuments();
        const activeCount = await Subscriber.countDocuments({ isActive: true });
        console.log(`📈 Total subscribers: ${totalCount}`);
        console.log(`✅ Active subscribers: ${activeCount}`);

        // Clean up test data
        console.log('\n🧹 Cleaning up test data...');
        await Subscriber.deleteOne({ chatId: testChatId });
        console.log('✅ Test data cleaned up');

        console.log('\n🎉 All subscription system tests passed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    } finally {
        // Disconnect from database
        console.log('\n📡 Disconnecting from MongoDB...');
        await disconnectFromDatabase();
        console.log('✅ Disconnected successfully');
    }
}

// Run the test
testSubscriptionSystem()
    .then(() => {
        console.log('\n✅ Subscription system test completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Subscription system test failed:', error);
        process.exit(1);
    });
