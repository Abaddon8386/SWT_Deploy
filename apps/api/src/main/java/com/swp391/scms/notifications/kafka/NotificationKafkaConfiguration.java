package com.swp391.scms.notifications.kafka;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.util.backoff.FixedBackOff;

@Configuration(proxyBeanMethods = false)
@EnableKafka
@ConditionalOnProperty(name = "app.notifications.kafka.enabled", havingValue = "true")
@EnableConfigurationProperties(NotificationKafkaProperties.class)
public class NotificationKafkaConfiguration {
    @Bean
    @ConditionalOnProperty(name = "app.notifications.kafka.create-topic", havingValue = "true")
    NewTopic notificationDeliveryTopic(NotificationKafkaProperties properties,
            @org.springframework.beans.factory.annotation.Value("${app.notifications.kafka.topic-replicas:1}") int replicas) {
        return TopicBuilder.name(properties.topic()).partitions(3).replicas(replicas).build();
    }

    @Bean
    ConcurrentKafkaListenerContainerFactory<String, String> notificationKafkaListenerContainerFactory(
            ConsumerFactory<String, String> consumers) {
        var factory = new ConcurrentKafkaListenerContainerFactory<String, String>();
        factory.setConsumerFactory(consumers);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.RECORD);
        // Retry this delivery three times, then allow other records through. The durable outbox
        // remains incomplete and its relay republishes it; it is never silently dropped.
        factory.setCommonErrorHandler(new DefaultErrorHandler((record, exception) ->
                org.slf4j.LoggerFactory.getLogger(NotificationKafkaConfiguration.class)
                        .warn("Notification delivery deferred to durable outbox retry"), new FixedBackOff(1000, 3)));
        return factory;
    }

    @Bean(name = "taskScheduler")
    @org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean(name = "taskScheduler")
    ThreadPoolTaskScheduler businessScheduler() {
        // Providing any TaskScheduler disables Boot's default: keep business jobs off the broker relay pool.
        var scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("business-scheduler-");
        return scheduler;
    }

    @Bean
    ThreadPoolTaskScheduler notificationRelayScheduler() {
        var scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("notification-outbox-");
        scheduler.setWaitForTasksToCompleteOnShutdown(true);
        scheduler.setAwaitTerminationSeconds(10);
        return scheduler;
    }
}
